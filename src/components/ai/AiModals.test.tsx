import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSampleWorkspace } from "../../data/sampleWorkspace";
import { RECRUITER_SYSTEM_PROMPT } from "../../lib/aiRewrite";
import {
  clearAiSettings,
  loadAiSettings,
  saveAiSettings,
  type AiSettings,
} from "../../lib/aiSettings";
import { auditResume } from "../../lib/atsAudit";
import { analyzeJobDescription } from "../../lib/jdEngine";
import { AiSettingsModal } from "./AiSettingsModal";
import { AiTailorModal } from "./AiTailorModal";

const VALID_KEY = "AIzaSyTestKeyForRoleFit1234567890";

function makeGeminiHttpResponse(payload: unknown, status = 200): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: typeof payload === "string" ? payload : JSON.stringify(payload) }],
          },
        },
      ],
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("AiSettingsModal", () => {
  it("saves a valid key to sessionStorage by default, supports localStorage opt-in, toggles visibility, and clears keys", () => {
    let current = loadAiSettings();
    const onClose = vi.fn();
    const { rerender } = render(
      <AiSettingsModal
        open
        settings={current}
        onClose={onClose}
        onSave={(input) => {
          const res = saveAiSettings(input);
          if (res.ok) current = loadAiSettings();
          return res;
        }}
        onClear={() => {
          clearAiSettings();
          current = loadAiSettings();
        }}
      />,
    );

    const keyInput = screen.getByLabelText("Gemini API key") as HTMLInputElement;
    expect(keyInput.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show API key" }));
    expect(keyInput.type).toBe("text");

    fireEvent.change(keyInput, { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));
    expect(screen.getByTestId("ai-settings-error")).toHaveTextContent(/Gemini API key/i);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.change(keyInput, { target: { value: VALID_KEY } });
    fireEvent.change(screen.getByLabelText("Gemini model"), {
      target: { value: "gemini-3.7-flash" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(current).toEqual({
      apiKey: VALID_KEY,
      model: "gemini-3.7-flash",
      storageMode: "session",
      source: "user",
    });

    rerender(
      <AiSettingsModal
        open
        settings={current}
        onClose={onClose}
        onSave={(input) => {
          const res = saveAiSettings(input);
          if (res.ok) current = loadAiSettings();
          return res;
        }}
        onClear={() => {
          clearAiSettings();
          current = loadAiSettings();
        }}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Remember on this device/i));
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));
    expect(current.storageMode).toBe("local");
    expect(localStorage.getItem("rolefit.ai.v1")).toContain("gemini-3.7-flash");
    expect(sessionStorage.getItem("rolefit.ai.v1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear key" }));
    expect(current.source).toBe("none");
    expect(current.apiKey).toBe("");
  });

  it("shows the local dev-env notice when source === 'dev-env' without exposing the raw dev key in the DOM", () => {
    const rawDevKey = "AIzaSySuperSecretDevEnvKey999999999";
    const devSettings: AiSettings = {
      apiKey: rawDevKey,
      model: "gemini-3.8-flash",
      storageMode: "session",
      source: "dev-env",
    };

    const { container } = render(
      <AiSettingsModal
        open
        settings={devSettings}
        onClose={() => {}}
        onSave={() => ({ ok: true })}
        onClear={() => {}}
      />,
    );

    expect(screen.getByTestId("dev-env-active-notice")).toHaveTextContent(/Local dev key active/i);
    const keyInput = screen.getByLabelText("Gemini API key") as HTMLInputElement;
    expect(keyInput.value).toBe("");
    expect(container.innerHTML).not.toContain(rawDevKey);
  });
});

describe("AiTailorModal", () => {
  it("renders zero-key demo mode with company type selector, missing keywords, and 1-click Copy Tailored Prompt", async () => {
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextSpy },
      configurable: true,
    });

    const sample = createSampleWorkspace();
    const matchResult = analyzeJobDescription(sample.resume, sample.jobDescription);
    const auditResult = auditResume(sample.resume);
    const onOpenSettings = vi.fn();

    render(
      <AiTailorModal
        open
        target={{ kind: "summary", summary: sample.resume.summary }}
        resume={sample.resume}
        jobDescription={sample.jobDescription}
        matchResult={matchResult}
        auditResult={auditResult}
        settings={{ apiKey: "", model: "gemini-3.8-flash", storageMode: "session", source: "none" }}
        onClose={() => {}}
        onOpenSettings={onOpenSettings}
        onAcceptSummary={() => {}}
        onAcceptExperience={() => {}}
        onAcceptProject={() => {}}
        onAcceptSkills={() => {}}
      />,
    );

    expect(screen.getByTestId("zero-key-fallback")).toBeInTheDocument();

    const companyGroup = screen.getByRole("group", { name: /Target company type/i });
    fireEvent.click(within(companyGroup).getByRole("button", { name: "Startup" }));
    expect(within(companyGroup).getByRole("button", { name: "Startup" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: /Copy Tailored Prompt/i }));
    await waitFor(() => {
      expect(screen.getByTestId("copy-prompt-status")).toBeInTheDocument();
    });

    expect(writeTextSpy).toHaveBeenCalledTimes(1);
    const copiedText = writeTextSpy.mock.calls[0][0] as string;
    expect(copiedText).toContain(RECRUITER_SYSTEM_PROMPT);
    expect(copiedText).toContain("COMPANY TYPE: startup.");
    expect(copiedText).toContain("<<<RESUME_CONTENT>>>");
    expect(copiedText).toContain("<<<RESUME_CONTEXT>>>");

    const fallbackTextarea = screen.getByLabelText("Tailored prompt") as HTMLTextAreaElement;
    expect(fallbackTextarea.value).toBe(copiedText);

    fireEvent.click(screen.getByRole("button", { name: /Configure Gemini API Key/i }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("calls Gemini when a key is active, renders the 4-part review layout with [NEED: ...] highlights, and applies only on Accept", async () => {
    const sample = createSampleWorkspace();
    const matchResult = analyzeJobDescription(sample.resume, sample.jobDescription);
    const auditResult = auditResume(sample.resume);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeGeminiHttpResponse({
        rewritten: {
          bullets: [
            "Architected multi-region TypeScript and React checkout platform cutting page load time by 42% with 99.98% uptime.",
            "Automated CI/CD canary rollouts reducing deployment rollback rate by [NEED: percent rollback reduction].",
          ],
        },
        changes: [
          "Front-loaded action verbs and surfaced Kubernetes keyword from job description.",
          "Added explicit [NEED] placeholder where rollback metric was missing.",
        ],
        missingNumbers: ["percent rollback reduction"],
        scanTest: {
          who: "Senior Distributed Systems & Platform Engineer",
          seniority: "Senior / Staff IC",
          whyThisJob: "Direct Kubernetes, TypeScript, and high-scale observability track record.",
        },
        qualificationNote: "Add explicit cloud certification if required by enterprise screening.",
      }),
    );

    const onAcceptExperience = vi.fn();
    const onClose = vi.fn();
    const roleItem = sample.resume.experience[0];

    render(
      <AiTailorModal
        open
        target={{ kind: "experience", item: roleItem }}
        resume={sample.resume}
        jobDescription={sample.jobDescription}
        matchResult={matchResult}
        auditResult={auditResult}
        settings={{
          apiKey: VALID_KEY,
          model: "gemini-3.8-flash",
          storageMode: "session",
          source: "user",
        }}
        onClose={onClose}
        onOpenSettings={() => {}}
        onAcceptSummary={() => {}}
        onAcceptExperience={onAcceptExperience}
        onAcceptProject={() => {}}
        onAcceptSkills={() => {}}
      />,
    );

    fireEvent.click(
      within(screen.getByRole("group", { name: /Target company type/i })).getByRole("button", {
        name: "Big Tech",
      }),
    );
    fireEvent.change(screen.getByLabelText(/Optional steering instruction/i), {
      target: { value: "Focus on scale and p99 reliability" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Rewrite" }));

    await waitFor(() => {
      expect(screen.getByTestId("ai-review-panel")).toBeInTheDocument();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("ai-diff-before")).toBeInTheDocument();
    expect(screen.getByTestId("ai-diff-after")).toHaveTextContent(/cutting page load time by 42%/i);
    expect(screen.getByTestId("need-placeholder")).toHaveTextContent(
      "[NEED: percent rollback reduction]",
    );
    expect(screen.getByTestId("ai-key-changes")).toHaveTextContent(/Front-loaded action verbs/i);
    expect(screen.getByTestId("ai-missing-numbers")).toHaveTextContent(
      /percent rollback reduction/i,
    );
    expect(screen.getByTestId("ai-scan-test")).toHaveTextContent(
      /Senior Distributed Systems & Platform Engineer/i,
    );
    expect(screen.getByTestId("ai-qualification-note")).toHaveTextContent(
      /Add explicit cloud certification/i,
    );

    // Must not mutate before Accept is clicked
    expect(onAcceptExperience).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Accept Rewrite" }));
    expect(onAcceptExperience).toHaveBeenCalledTimes(1);
    expect(onAcceptExperience.mock.calls[0][0].bullets[0].text).toContain(
      "cutting page load time by 42%",
    );
  });

  it("handles Gemini API errors (401/429) and request cancellation cleanly without mutating the resume", async () => {
    const sample = createSampleWorkspace();
    const matchResult = analyzeJobDescription(sample.resume, sample.jobDescription);
    const auditResult = auditResume(sample.resume);
    const onAcceptSummary = vi.fn();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

    render(
      <AiTailorModal
        open
        target={{ kind: "summary", summary: sample.resume.summary }}
        resume={sample.resume}
        jobDescription={sample.jobDescription}
        matchResult={matchResult}
        auditResult={auditResult}
        settings={{
          apiKey: VALID_KEY,
          model: "gemini-3.8-flash",
          storageMode: "session",
          source: "user",
        }}
        onClose={() => {}}
        onOpenSettings={() => {}}
        onAcceptSummary={onAcceptSummary}
        onAcceptExperience={() => {}}
        onAcceptProject={() => {}}
        onAcceptSkills={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate Rewrite" }));
    await waitFor(() => {
      expect(screen.getByTestId("ai-tailor-error")).toHaveTextContent(/rejected the API key/i);
    });
    expect(onAcceptSummary).not.toHaveBeenCalled();

    // Now test AbortController cancellation mid-flight
    vi.spyOn(globalThis, "fetch").mockImplementationOnce((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Rewrite" }));
    const cancelBtn = await screen.findByRole("button", { name: "Cancel Request" });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.getByTestId("ai-tailor-error")).toHaveTextContent(/cancelled/i);
    });
    expect(onAcceptSummary).not.toHaveBeenCalled();
  });
});
