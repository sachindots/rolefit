import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { serializeBackup } from "./lib/backup";
import { createEmptyWorkspace } from "./lib/schema";
import { STORAGE_KEY, loadWorkspaceState } from "./lib/storage";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  vi.restoreAllMocks();
});

describe("App", () => {
  it("renders the product title, privacy indicator, editor pane, live match badge, and preview sheet on first visit", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "RoleFit" })).toBeInTheDocument();
    expect(screen.getByText("Local-only · Zero tracking")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resume editor" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resume preview" })).toBeInTheDocument();
    expect(screen.getByTestId("resume-sheet")).toHaveAttribute("data-template", "classic-executive");
    expect(screen.getByTestId("resume-sheet")).toHaveAttribute("data-page-size", "letter");

    const tabScore = Number.parseInt(screen.getByTestId("tab-match-score").textContent ?? "0", 10);
    expect(tabScore).toBeGreaterThan(50);
  });

  it("persists edits to localStorage, updates live preview immediately, and reloads them", () => {
    const { unmount } = render(<App />);
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Grace Hopper" } });
    fireEvent.click(screen.getByRole("button", { name: "Add skill group" }));

    const sheet = screen.getByTestId("resume-sheet");
    expect(within(sheet).getByRole("heading", { level: 1, name: "Grace Hopper" })).toBeInTheDocument();
    expect(loadWorkspaceState().state.resume.contact.fullName).toBe("Grace Hopper");
    unmount();

    render(<App />);
    expect(screen.getByLabelText("Full name")).toHaveValue("Grace Hopper");
    expect(within(screen.getByTestId("resume-sheet")).getByRole("heading", { level: 1, name: "Grace Hopper" })).toBeInTheDocument();
  });

  it("updates live JD match score, matched/missing chips, and ATS audit findings in real time", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: /JD Match/i }));
    const matchPane = screen.getByRole("region", { name: "JD match and ATS audit" });
    expect(matchPane.className).toContain("block");

    const jdInput = screen.getByLabelText("Job description");
    fireEvent.change(jdInput, {
      target: { value: "Hiring an engineer skilled in TypeScript, Node.js, C++, and C#." },
    });

    const matched = screen.getByTestId("matched-keywords");
    const missing = screen.getByTestId("missing-keywords");
    expect(within(matched).getByText("TypeScript")).toBeInTheDocument();
    expect(within(matched).getByText("Node.js")).toBeInTheDocument();
    expect(within(matched).getByText("C++")).toBeInTheDocument();
    expect(within(missing).getByText("C#")).toBeInTheDocument();
    expect(screen.getByTestId("jd-match-score")).toHaveTextContent("75%");
    expect(screen.getByTestId("tab-match-score")).toHaveTextContent("75%");

    fireEvent.click(screen.getByRole("tab", { name: "Editor" }));
    fireEvent.change(screen.getByLabelText(/Skills \(skill group 1\)/i), {
      target: { value: "TypeScript, JavaScript, C++, C#, SQL" },
    });

    expect(screen.getByTestId("tab-match-score")).toHaveTextContent("100%");
    fireEvent.click(screen.getByRole("tab", { name: /JD Match/i }));
    expect(screen.getByTestId("jd-match-score")).toHaveTextContent("100%");
    expect(within(screen.getByTestId("matched-keywords")).getByText("C#")).toBeInTheDocument();
  });

  it("switches across all 3 ATS-safe templates and persists template selection", () => {
    const { unmount } = render(<App />);
    const sheet = screen.getByTestId("resume-sheet");
    const templateGroup = screen.getByRole("group", { name: "Resume template" });

    fireEvent.click(within(templateGroup).getByRole("button", { name: "Modern Minimal" }));
    expect(sheet).toHaveAttribute("data-template", "modern-minimal");
    expect(loadWorkspaceState().state.template).toBe("modern-minimal");

    fireEvent.click(within(templateGroup).getByRole("button", { name: "Technical Compact" }));
    expect(sheet).toHaveAttribute("data-template", "technical-compact");
    expect(loadWorkspaceState().state.template).toBe("technical-compact");

    fireEvent.click(within(templateGroup).getByRole("button", { name: "Classic Executive" }));
    expect(sheet).toHaveAttribute("data-template", "classic-executive");
    expect(loadWorkspaceState().state.template).toBe("classic-executive");

    fireEvent.click(within(templateGroup).getByRole("button", { name: "Technical Compact" }));
    unmount();

    render(<App />);
    expect(screen.getByTestId("resume-sheet")).toHaveAttribute("data-template", "technical-compact");
  });

  it("toggles US Letter and A4 page size and persists pageSize in localStorage", () => {
    const { unmount } = render(<App />);
    const sheet = screen.getByTestId("resume-sheet");
    const pageSizeGroup = screen.getByRole("group", { name: "Page size" });

    expect(sheet).toHaveAttribute("data-page-size", "letter");
    fireEvent.click(within(pageSizeGroup).getByRole("button", { name: "A4" }));
    expect(sheet).toHaveAttribute("data-page-size", "a4");
    expect(loadWorkspaceState().state.pageSize).toBe("a4");

    unmount();
    render(<App />);
    expect(screen.getByTestId("resume-sheet")).toHaveAttribute("data-page-size", "a4");

    fireEvent.click(within(screen.getByRole("group", { name: "Page size" })).getByRole("button", { name: "Letter" }));
    expect(screen.getByTestId("resume-sheet")).toHaveAttribute("data-page-size", "letter");
    expect(loadWorkspaceState().state.pageSize).toBe("letter");
  });

  it("switches between Editor, JD Match, and Preview tabs for tablet/mobile view", () => {
    render(<App />);
    const editorTab = screen.getByRole("tab", { name: "Editor" });
    const matchTab = screen.getByRole("tab", { name: /JD Match/i });
    const previewTab = screen.getByRole("tab", { name: "Preview" });
    const editorPane = screen.getByRole("region", { name: "Resume editor" });
    const matchPane = screen.getByRole("region", { name: "JD match and ATS audit" });
    const previewPane = screen.getByRole("region", { name: "Resume preview" });

    expect(editorTab).toHaveAttribute("aria-selected", "true");
    expect(previewTab).toHaveAttribute("aria-selected", "false");
    expect(editorPane.className).toContain("block");
    expect(previewPane.className).toContain("hidden");

    fireEvent.click(matchTab);
    expect(matchTab).toHaveAttribute("aria-selected", "true");
    expect(matchPane.className).toContain("block");
    expect(editorPane.className).toContain("hidden");

    fireEvent.click(previewTab);
    expect(editorTab).toHaveAttribute("aria-selected", "false");
    expect(previewTab).toHaveAttribute("aria-selected", "true");
    expect(editorPane.className).toContain("hidden");
    expect(previewPane.className).toContain("block");
  });

  it("toggles Studio dark and light mode, persists theme, and keeps the printable resume sheet crisp white", () => {
    const { unmount } = render(<App />);
    const root = screen.getByTestId("studio-root");
    const sheet = screen.getByTestId("resume-sheet");
    const themeToggle = screen.getByTestId("theme-toggle");

    expect(root).toHaveAttribute("data-theme", "light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(sheet.className).toContain("bg-white");
    expect(sheet.className).toContain("text-slate-900");

    fireEvent.click(themeToggle);
    expect(root).toHaveAttribute("data-theme", "dark");
    expect(root.className).toContain("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(loadWorkspaceState().state.theme).toBe("dark");
    expect(sheet.className).toContain("bg-white");
    expect(sheet.className).toContain("text-slate-900");

    unmount();
    render(<App />);
    expect(screen.getByTestId("studio-root")).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByTestId("resume-sheet").className).toContain("bg-white");
  });

  it("guards Start blank and Load sample with ConfirmDialog and updates state on confirm", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start blank" }));
    const blankDialog = screen.getByRole("dialog", { name: "Start blank workspace?" });
    expect(blankDialog).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Alex Morgan");

    fireEvent.click(screen.getByRole("button", { name: "Start blank" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Start blank" }));
    expect(screen.getByLabelText("Full name")).toHaveValue("");
    expect(screen.getByTestId("tab-match-score")).toHaveTextContent("0%");

    fireEvent.click(screen.getByRole("button", { name: "Load sample" }));
    const sampleDialog = screen.getByRole("dialog", { name: "Load sample workspace?" });
    fireEvent.click(within(sampleDialog).getByRole("button", { name: "Load sample" }));
    expect(screen.getByLabelText("Full name")).toHaveValue("Alex Morgan");
    expect(Number.parseInt(screen.getByTestId("tab-match-score").textContent ?? "0", 10)).toBeGreaterThan(50);
  });

  it("exports JSON backup and imports valid, sanitized, or invalid JSON with status/error banners", async () => {
    const createObjectUrlSpy = vi.fn(() => "blob:rolefit-backup");
    const revokeObjectUrlSpy = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectUrlSpy, configurable: true, writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectUrlSpy, configurable: true, writable: true });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);

    const fileInput = screen.getByTestId("import-json-input") as HTMLInputElement;

    const badFile = new File(["{corrupt json"], "bad.json", { type: "application/json" });
    fireEvent.change(fileInput, { target: { files: [badFile] } });
    await waitFor(() => {
      expect(screen.getByTestId("studio-banner")).toHaveTextContent(/not valid JSON/i);
    });
    expect(screen.getByLabelText("Full name")).toHaveValue("Alex Morgan");

    const customState = createEmptyWorkspace();
    customState.resume.contact.fullName = "Ada <script>alert(1)</script>Lovelace";
    customState.resume.contact.website = "javascript:alert(1)";
    const rawWithXss = serializeBackup(customState);
    const xssFile = new File([rawWithXss], "xss.json", { type: "application/json" });
    fireEvent.change(fileInput, { target: { files: [xssFile] } });

    await waitFor(() => {
      expect(screen.getByTestId("studio-banner")).toHaveTextContent(/imported with warnings/i);
    });
    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Website")).toHaveValue("");

    clickSpy.mockRestore();
  });

  it("triggers window.print() when Export PDF is clicked", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Export PDF" }));
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it("keeps valid stored data when a URL is partially typed", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Website"), { target: { value: "https://ok.dev" } });
    fireEvent.change(screen.getByLabelText("Website"), { target: { value: "htt" } });
    const stored = loadWorkspaceState();
    expect(stored.recovered).toBe(false);
    expect(stored.state.resume.contact.website).toBe("https://ok.dev");
  });

  it("recovers from corrupt stored data with a notice", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent(/unreadable/);
  });

  it("switches privacy badge when Gemini key is configured and supports per-section Tailor with AI (Summary, Experience, Projects, Skills) with Accept and Discard", async () => {
    render(<App />);

    expect(screen.getByTestId("privacy-badge")).toHaveTextContent("Local-only · Zero tracking");

    // Open Summary Tailor modal in zero-key mode first
    fireEvent.click(screen.getByTestId("tailor-summary-button"));
    expect(screen.getByTestId("zero-key-fallback")).toBeInTheDocument();

    // Click Configure Gemini API Key inside Tailor modal — closes Tailor modal so no two modals stack
    fireEvent.click(screen.getByRole("button", { name: /Configure Gemini API Key/i }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const settingsDialog = screen.getByRole("dialog", { name: /AI Settings/i });
    fireEvent.change(within(settingsDialog).getByLabelText("Gemini API key"), {
      target: { value: "AIzaSyAppTestValidKey1234567890" },
    });
    fireEvent.click(within(settingsDialog).getByRole("button", { name: "Save key" }));

    // Privacy badge updates immediately to Local-first
    expect(screen.getByTestId("privacy-badge")).toHaveTextContent(
      "Local-first · AI via Gemini (on click)",
    );

    const originalSummary = (screen.getByLabelText("Summary") as HTMLTextAreaElement).value;
    const tailoredSummary =
      "Principal Distributed Systems Engineer with 9 years scaling TypeScript and Node.js platforms reducing page load latency by 42%.";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      rewritten: tailoredSummary,
                      changes: ["Aligned summary with target JD keywords and preserved 42% metric."],
                      missingNumbers: [],
                      scanTest: {
                        who: "Principal Platform Engineer",
                        seniority: "Staff / Principal",
                        whyThisJob: "Proven TypeScript and Kubernetes architecture delivery.",
                      },
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

    fireEvent.click(screen.getByTestId("tailor-summary-button"));
    fireEvent.click(screen.getByRole("button", { name: "Generate Rewrite" }));
    await waitFor(() => {
      expect(screen.getByTestId("ai-review-panel")).toBeInTheDocument();
    });

    // Discard first: summary must remain unchanged
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByLabelText("Summary")).toHaveValue(originalSummary);

    // Re-open Summary Tailor, generate, and Accept
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      rewritten: tailoredSummary,
                      changes: ["Aligned summary with target JD keywords."],
                      missingNumbers: [],
                      scanTest: {
                        who: "Principal Platform Engineer",
                        seniority: "Staff / Principal",
                        whyThisJob: "Proven TypeScript and Kubernetes architecture delivery.",
                      },
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

    fireEvent.click(screen.getByTestId("tailor-summary-button"));
    fireEvent.click(screen.getByRole("button", { name: "Generate Rewrite" }));
    await waitFor(() => {
      expect(screen.getByTestId("ai-review-panel")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Accept Rewrite" }));
    expect(screen.getByLabelText("Summary")).toHaveValue(tailoredSummary);

    // Verify Experience, Project, and Skills Tailor triggers open their respective sections
    fireEvent.click(screen.getByTestId("tailor-experience-1-button"));
    expect(screen.getByRole("dialog", { name: /Tailor with AI · Experience/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    fireEvent.click(screen.getByTestId("tailor-project-1-button"));
    expect(screen.getByRole("dialog", { name: /Tailor with AI · Project/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    fireEvent.click(screen.getByTestId("tailor-skills-button"));
    expect(screen.getByRole("dialog", { name: /Tailor with AI · Skills/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    // Clear key in AI Settings and verify privacy badge returns to Local-only
    fireEvent.click(screen.getByTestId("ai-settings-button"));
    const reopenSettings = screen.getByRole("dialog", { name: /AI Settings/i });
    fireEvent.click(within(reopenSettings).getByRole("button", { name: "Clear key" }));
    fireEvent.click(within(reopenSettings).getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("privacy-badge")).toHaveTextContent("Local-only · Zero tracking");
  });

  it("closes AiTailorModal when opening AiSettingsModal so Escape never conflicts with stacked modals", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("tailor-summary-button"));
    expect(screen.getByRole("dialog", { name: /Tailor with AI/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Configure Gemini API Key/i }));
    expect(screen.queryByRole("dialog", { name: /Tailor with AI/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: /AI Settings/i })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uploads a resume via Review-Before-Import modal, cancels safely, and applies while preserving workspace preferences", async () => {
    render(<App />);

    // Customize workspace preferences before upload
    fireEvent.click(within(screen.getByRole("group", { name: "Resume template" })).getByRole("button", { name: "Modern Minimal" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Page size" })).getByRole("button", { name: "A4" }));
    fireEvent.click(screen.getByTestId("theme-toggle"));
    const originalJd = loadWorkspaceState().state.jobDescription;

    const uploadedText = [
      "Maya Patel",
      "Senior Frontend Engineer",
      "maya@example.com | Austin, TX",
      "",
      "SUMMARY",
      "Frontend architect focused on accessible React and TypeScript systems.",
      "",
      "EXPERIENCE",
      "Staff Frontend Engineer — FinFlow | 2022 - Present",
      "- Built design system adopted by 14 teams cutting UI defects by 40%.",
    ].join("\n");

    // Open modal, upload file, then Cancel -> original resume stays intact
    fireEvent.click(screen.getByTestId("upload-resume-button"));
    const cancelFile = new File([uploadedText], "maya-cv.txt", { type: "text/plain" });
    fireEvent.change(screen.getByTestId("resume-upload-input"), { target: { files: [cancelFile] } });
    await waitFor(() => {
      expect(screen.getByTestId("upload-review-summary")).toBeInTheDocument();
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Full name")).toHaveValue("Alex Morgan");

    // Re-open, upload, and Apply to Editor
    fireEvent.click(screen.getByTestId("upload-resume-button"));
    const applyFile = new File([uploadedText], "maya-cv.txt", { type: "text/plain" });
    fireEvent.change(screen.getByTestId("resume-upload-input"), { target: { files: [applyFile] } });
    await waitFor(() => {
      expect(screen.getByTestId("upload-review-summary")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("apply-resume-button"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Maya Patel");
    expect(within(screen.getByTestId("resume-sheet")).getByRole("heading", { level: 1, name: "Maya Patel" })).toBeInTheDocument();

    // Workspace preferences and JD are preserved, and resume persisted to localStorage
    const saved = loadWorkspaceState().state;
    expect(saved.resume.contact.fullName).toBe("Maya Patel");
    expect(saved.jobDescription).toBe(originalJd);
    expect(saved.template).toBe("modern-minimal");
    expect(saved.pageSize).toBe("a4");
    expect(saved.theme).toBe("dark");

    // Dismissible success banner
    const banner = screen.getByTestId("studio-banner");
    expect(banner).toHaveTextContent("Resume imported from maya-cv.txt.");
    fireEvent.click(within(banner).getByRole("button", { name: "Dismiss notice" }));
    expect(screen.queryByTestId("studio-banner")).not.toBeInTheDocument();
  });
});
