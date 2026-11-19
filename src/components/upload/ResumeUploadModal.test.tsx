import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import type { AiSettings } from "../../lib/aiSettings";
import { ResumeUploadModal } from "./ResumeUploadModal";

const NO_KEY_SETTINGS: AiSettings = {
  apiKey: "",
  model: "gemini-2.5-flash",
  storageMode: "session",
  source: "none",
};

const ACTIVE_KEY_SETTINGS: AiSettings = {
  apiKey: "AIzaSyUploadTestValidKey1234567890",
  model: "gemini-2.5-flash",
  storageMode: "session",
  source: "user",
};

const SAMPLE_TXT_RESUME = `Jordan Lee
Staff Platform Engineer
jordan@example.com | (415) 555-0199 | Seattle, WA | https://github.com/jordanlee

SUMMARY
Distributed systems engineer with 8 years building TypeScript and Go services.

EXPERIENCE
Senior Engineer — CloudScale | Jan 2021 - Present
- Built multi-region event pipeline cutting p99 latency by 38% across 12 services.
- Automated Kubernetes rollouts reducing deploy failures by 55%.

PROJECTS
TraceLite — https://tracelite.dev
- Open-source OpenTelemetry collector built with Go and Rust.

SKILLS
Languages: TypeScript, Go, Rust, SQL
Cloud: Kubernetes, AWS, Terraform

EDUCATION
B.S. Computer Science — University of Washington | 2014 - 2018

CERTIFICATIONS
AWS Solutions Architect Associate
`;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ResumeUploadModal", () => {
  it("uploads a valid .txt resume, displays parsed sections, warnings, and collapsible unmapped lines, and applies on confirm", async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <ResumeUploadModal
        open={true}
        aiSettings={NO_KEY_SETTINGS}
        onClose={onClose}
        onApply={onApply}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Upload Resume" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    expect(screen.getByText(/Parsed 100% locally in your browser/i)).toBeInTheDocument();
    expect(screen.getByText(/up to 5 MB/i)).toBeInTheDocument();

    const file = new File([SAMPLE_TXT_RESUME], "jordan-resume.txt", { type: "text/plain" });
    fireEvent.change(screen.getByTestId("resume-upload-input"), { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Review Extracted Resume" })).toBeInTheDocument();
    });

    const summary = screen.getByTestId("upload-review-summary");
    expect(within(summary).getByText("Jordan Lee")).toBeInTheDocument();
    expect(within(summary).getByText("jordan@example.com")).toBeInTheDocument();
    expect(within(summary).getByText(/1 role · 2 bullets/i)).toBeInTheDocument();
    expect(within(summary).getByText(/1 project · 1 bullet/i)).toBeInTheDocument();
    expect(within(summary).getByText(/2 groups/i)).toBeInTheDocument();
    expect(within(summary).getByText(/1 entry/i)).toBeInTheDocument();

    // Unmapped lines (CERTIFICATIONS section) are collapsible
    const unmappedSection = screen.getByTestId("unmapped-lines-section");
    expect(screen.queryByTestId("unmapped-lines-list")).not.toBeInTheDocument();
    fireEvent.click(within(unmappedSection).getByRole("button", { name: /Unmapped lines/i }));
    expect(screen.getByTestId("unmapped-lines-list")).toHaveTextContent(
      /AWS Solutions Architect Associate/i,
    );

    // Gemini enhance button is disabled when no key is configured
    const enhanceBtn = screen.getByTestId("enhance-gemini-button");
    expect(enhanceBtn).toBeDisabled();
    expect(enhanceBtn).toHaveAttribute("title", expect.stringMatching(/AI Settings/i));

    // Confirm apply
    fireEvent.click(screen.getByTestId("apply-resume-button"));
    expect(onApply).toHaveBeenCalledTimes(1);
    const [appliedResume, appliedFileName] = onApply.mock.calls[0];
    expect(appliedFileName).toBe("jordan-resume.txt");
    expect(appliedResume.contact.fullName).toBe("Jordan Lee");
    expect(appliedResume.experience).toHaveLength(1);
  });

  it("supports drag-and-drop and cancels without calling onApply", async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <ResumeUploadModal
        open={true}
        aiSettings={NO_KEY_SETTINGS}
        onClose={onClose}
        onApply={onApply}
      />,
    );

    const file = new File([SAMPLE_TXT_RESUME], "dropped.txt", { type: "text/plain" });
    const dropzone = screen.getByTestId("resume-dropzone");
    fireEvent.dragOver(dropzone, { dataTransfer: { files: [file] } });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("upload-review-summary")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("shows an inline error for invalid, spoofed, or unsupported files without crashing", async () => {
    const onApply = vi.fn();
    render(
      <ResumeUploadModal
        open={true}
        aiSettings={NO_KEY_SETTINGS}
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    const unsupported = new File(["hello"], "malware.exe", { type: "application/octet-stream" });
    fireEvent.change(screen.getByTestId("resume-upload-input"), {
      target: { files: [unsupported] },
    });

    await waitFor(() => {
      expect(screen.getByTestId("upload-error")).toHaveTextContent(/Unsupported file format/i);
    });
    expect(screen.queryByTestId("upload-review-summary")).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();

    // Spoofed PDF (PNG magic bytes with .pdf extension)
    const spoofedPdf = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])], "fake.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByTestId("resume-upload-input"), {
      target: { files: [spoofedPdf] },
    });

    await waitFor(() => {
      expect(screen.getByTestId("upload-error")).toHaveTextContent(/Invalid PDF/i);
    });
  });

  it("supports Escape to close, Tab/Shift+Tab focus trapping, and focus restoration", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open Upload
          </button>
          <ResumeUploadModal
            open={open}
            aiSettings={NO_KEY_SETTINGS}
            onClose={() => setOpen(false)}
            onApply={vi.fn()}
          />
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open Upload" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Upload Resume" });
    expect(dialog).toBeInTheDocument();

    const closeBtn = within(dialog).getByRole("button", { name: "Close upload modal" });
    const cancelBtn = within(dialog).getByRole("button", { name: "Cancel" });

    // Shift+Tab from first focusable wraps to last
    closeBtn.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(cancelBtn);

    // Tab from last focusable wraps to first
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(closeBtn);

    // Escape closes modal and restores focus to trigger
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("runs optional Gemini-enhanced extraction when key is active and preserves local draft on error", async () => {
    const onApply = vi.fn();

    render(
      <ResumeUploadModal
        open={true}
        aiSettings={ACTIVE_KEY_SETTINGS}
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    const file = new File([SAMPLE_TXT_RESUME], "jordan.txt", { type: "text/plain" });
    fireEvent.change(screen.getByTestId("resume-upload-input"), { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("upload-review-summary")).toBeInTheDocument();
    });

    // First attempt: Gemini returns HTTP 500 -> inline error shown, local draft preserved
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Upstream error" } }), { status: 500 }),
    );

    const enhanceBtn = screen.getByTestId("enhance-gemini-button");
    expect(enhanceBtn).toBeEnabled();
    fireEvent.click(enhanceBtn);

    await waitFor(() => {
      expect(screen.getByTestId("gemini-enhance-error")).toBeInTheDocument();
    });
    expect(within(screen.getByTestId("upload-review-summary")).getByText("Jordan Lee")).toBeInTheDocument();

    // Second attempt: Gemini succeeds -> draft updates cleanly
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      contact: {
                        fullName: "Jordan Lee",
                        headline: "Staff Platform Engineer",
                        email: "jordan@example.com",
                        phone: "(415) 555-0199",
                        location: "Seattle, WA",
                        website: "",
                        linkedin: "",
                        github: "https://github.com/jordanlee",
                      },
                      summary: "Distributed systems engineer with 8 years building TypeScript and Go services.",
                      experience: [
                        {
                          company: "CloudScale",
                          role: "Senior Engineer",
                          location: "",
                          startDate: "Jan 2021",
                          endDate: "Present",
                          bullets: [
                            "Built multi-region event pipeline cutting p99 latency by 38% across 12 services.",
                            "Automated Kubernetes rollouts reducing deploy failures by 55%.",
                          ],
                        },
                      ],
                      projects: [
                        {
                          name: "TraceLite",
                          link: "https://tracelite.dev",
                          description: "Open-source OpenTelemetry collector",
                          technologies: ["Go", "Rust"],
                          bullets: ["Open-source OpenTelemetry collector built with Go and Rust."],
                        },
                      ],
                      skills: [
                        { category: "Languages", items: ["TypeScript", "Go", "Rust", "SQL"] },
                        { category: "Cloud", items: ["Kubernetes", "AWS", "Terraform"] },
                      ],
                      education: [
                        {
                          institution: "University of Washington",
                          degree: "B.S. Computer Science",
                          location: "",
                          startDate: "2014",
                          endDate: "2018",
                          details: "",
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    fireEvent.click(enhanceBtn);
    await waitFor(() => {
      expect(screen.getByTestId("gemini-enhanced-badge")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("gemini-enhance-error")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("apply-resume-button"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].projects[0].technologies).toEqual(["Go", "Rust"]);
  });
});
