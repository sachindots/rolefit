import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  COMPANY_CALIBRATION,
  RECRUITER_SYSTEM_PROMPT,
  buildTailorPrompt,
  rewriteSectionWithGemini,
  type AiRewriteSuccess,
  type CompanyType,
  type RewriteTarget,
} from "../../lib/aiRewrite";
import type { AiSettings } from "../../lib/aiSettings";
import type { AtsAuditResult, AuditFinding } from "../../lib/atsAudit";
import type { JdMatchResult } from "../../lib/jdEngine";
import type {
  ExperienceItem,
  ProjectItem,
  ResumeData,
  SkillGroup,
} from "../../types/resume";

export interface AiTailorModalProps {
  open: boolean;
  target: RewriteTarget | null;
  resume: ResumeData;
  jobDescription: string;
  matchResult: JdMatchResult;
  auditResult: AtsAuditResult;
  settings: AiSettings;
  onClose: () => void;
  onOpenSettings: () => void;
  onAcceptSummary: (summary: string) => void;
  onAcceptExperience: (item: ExperienceItem) => void;
  onAcceptProject: (item: ProjectItem) => void;
  onAcceptSkills: (groups: SkillGroup[]) => void;
}

export const COMPANY_TYPE_OPTIONS: ReadonlyArray<{ id: CompanyType; label: string }> = [
  { id: "general", label: "General" },
  { id: "big-tech", label: "Big Tech" },
  { id: "startup", label: "Startup" },
  { id: "enterprise", label: "Enterprise" },
  { id: "agency", label: "Agency" },
  { id: "non-technical", label: "Non-Technical" },
];

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SECTION_OF_KIND = {
  summary: "summary",
  experience: "experience",
  project: "projects",
  skills: "skills",
} as const;

const NEED_SPLIT_RE = /(\[NEED:[^\]]*\])/gi;

function renderWithNeedHighlights(text: string): ReactNode {
  const parts = text.split(NEED_SPLIT_RE);
  if (parts.length === 1) return text;
  return parts.map((part, idx) => {
    if (/^\[NEED:[^\]]*\]$/i.test(part)) {
      return (
        <mark
          key={idx}
          data-testid="need-placeholder"
          className="rounded bg-amber-100 px-1 py-0.5 font-semibold text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950/90 dark:text-amber-200 dark:ring-amber-700"
        >
          {part}
        </mark>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export function buildResumeContextForTarget(resume: ResumeData, target: RewriteTarget): string {
  const chunks: string[] = [];
  if (target.kind !== "summary" && resume.summary.trim() !== "") {
    chunks.push(`Summary: ${resume.summary}`);
  }
  for (const exp of resume.experience) {
    if (target.kind === "experience" && exp.id === target.item.id) continue;
    const bullets = exp.bullets.map((b) => `- ${b.text}`).join("\n");
    chunks.push(
      `Experience: ${exp.role} at ${exp.company} (${exp.startDate} - ${exp.endDate})\n${bullets}`,
    );
  }
  for (const proj of resume.projects) {
    if (target.kind === "project" && proj.id === target.item.id) continue;
    const bullets = proj.bullets.map((b) => `- ${b.text}`).join("\n");
    chunks.push(
      `Project: ${proj.name} (${proj.technologies.join(", ")})\n${proj.description}\n${bullets}`,
    );
  }
  if (target.kind !== "skills" && resume.skills.length > 0) {
    chunks.push(
      `Skills: ${resume.skills.map((g) => `${g.category}: ${g.items.join(", ")}`).join("; ")}`,
    );
  }
  return chunks.join("\n\n");
}

function getTargetHeading(target: RewriteTarget): string {
  switch (target.kind) {
    case "summary":
      return "Professional Summary";
    case "experience":
      return `Experience — ${target.item.role || target.item.company || "Role"}`;
    case "project":
      return `Project — ${target.item.name || "Project"}`;
    case "skills":
      return "Skills";
  }
}

function getRelevantFindings(target: RewriteTarget, audit: AtsAuditResult): AuditFinding[] {
  const section = SECTION_OF_KIND[target.kind];
  const entryId =
    target.kind === "experience" || target.kind === "project" ? target.item.id : undefined;
  return audit.findings
    .filter((f) => f.section === section && (f.entryId === undefined || f.entryId === entryId))
    .slice(0, 6);
}

type AnyRewriteSuccess = AiRewriteSuccess<string | ExperienceItem | ProjectItem | SkillGroup[]>;

export function AiTailorModal({
  open,
  target,
  resume,
  jobDescription,
  matchResult,
  auditResult,
  settings,
  onClose,
  onOpenSettings,
  onAcceptSummary,
  onAcceptExperience,
  onAcceptProject,
  onAcceptSkills,
}: AiTailorModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [companyType, setCompanyType] = useState<CompanyType>("general");
  const [userInstruction, setUserInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewriteResult, setRewriteResult] = useState<AnyRewriteSuccess | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showPromptFallback, setShowPromptFallback] = useState(false);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }
    setCompanyType("general");
    setUserInstruction("");
    setLoading(false);
    setError(null);
    setRewriteResult(null);
    setCopiedPrompt(false);
    setShowPromptFallback(false);
  }, [open, target]);

  useEffect(() => {
    if (!open) return;

    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        abortRef.current?.abort();
        abortRef.current = null;
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !dialogRef.current.contains(active)) {
          event.preventDefault();
          last?.focus();
        }
      } else if (active === last || !dialogRef.current.contains(active)) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [open]);

  if (!open || !target) return null;

  const hasApiKey = settings.source !== "none" && Boolean(settings.apiKey);
  const resumeContext = buildResumeContextForTarget(resume, target);
  const userPrompt = buildTailorPrompt({
    target,
    jobDescription,
    companyType,
    match: matchResult,
    audit: auditResult,
    userInstruction,
    resumeContext,
  });
  const fullTailoredPrompt = `${RECRUITER_SYSTEM_PROMPT}\n\n${userPrompt}`;
  const missingKeywords = matchResult.missing.slice(0, 10);
  const relevantFindings = getRelevantFindings(target, auditResult);

  const handleCopyPrompt = async () => {
    setShowPromptFallback(true);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(fullTailoredPrompt);
      }
      setCopiedPrompt(true);
    } catch {
      setCopiedPrompt(true);
    }
  };

  const handleCancelRequest = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const handleGenerateRewrite = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setRewriteResult(null);

    try {
      const commonParams = {
        settings,
        jobDescription,
        companyType,
        match: matchResult,
        audit: auditResult,
        userInstruction,
        resumeContext,
        signal: controller.signal,
      };

      const res =
        target.kind === "summary"
          ? await rewriteSectionWithGemini({ ...commonParams, target })
          : target.kind === "experience"
            ? await rewriteSectionWithGemini({ ...commonParams, target })
            : target.kind === "project"
              ? await rewriteSectionWithGemini({ ...commonParams, target })
              : await rewriteSectionWithGemini({ ...commonParams, target });

      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRewriteResult(res);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setLoading(false);
    }
  };

  const handleAccept = () => {
    if (!rewriteResult) return;
    if (target.kind === "summary" && typeof rewriteResult.rewritten === "string") {
      onAcceptSummary(rewriteResult.rewritten);
    } else if (
      target.kind === "experience" &&
      typeof rewriteResult.rewritten === "object" &&
      !Array.isArray(rewriteResult.rewritten) &&
      "company" in rewriteResult.rewritten
    ) {
      onAcceptExperience(rewriteResult.rewritten);
    } else if (
      target.kind === "project" &&
      typeof rewriteResult.rewritten === "object" &&
      !Array.isArray(rewriteResult.rewritten) &&
      "name" in rewriteResult.rewritten
    ) {
      onAcceptProject(rewriteResult.rewritten);
    } else if (target.kind === "skills" && Array.isArray(rewriteResult.rewritten)) {
      onAcceptSkills(rewriteResult.rewritten);
    }
    onClose();
  };

  const renderBeforeContent = () => {
    switch (target.kind) {
      case "summary":
        return (
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700 dark:text-slate-200">
            {target.summary || "(Empty summary)"}
          </p>
        );
      case "experience":
        return (
          <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
            {target.item.bullets.length === 0 ? (
              <li className="italic text-slate-400">(No bullets)</li>
            ) : (
              target.item.bullets.map((b) => <li key={b.id}>{b.text}</li>)
            )}
          </ul>
        );
      case "project":
        return (
          <div className="space-y-2 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
            <p>{target.item.description || "(No description)"}</p>
            {target.item.bullets.length > 0 && (
              <ul className="list-disc space-y-1 pl-4">
                {target.item.bullets.map((b) => (
                  <li key={b.id}>{b.text}</li>
                ))}
              </ul>
            )}
          </div>
        );
      case "skills":
        return (
          <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-200">
            {target.groups.map((g) => (
              <div key={g.id}>
                <span className="font-semibold">{g.category}:</span> {g.items.join(", ")}
              </div>
            ))}
          </div>
        );
    }
  };

  const renderAfterContent = () => {
    if (!rewriteResult) return null;
    const { rewritten } = rewriteResult;
    if (target.kind === "summary" && typeof rewritten === "string") {
      return (
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-900 dark:text-slate-100">
          {renderWithNeedHighlights(rewritten)}
        </p>
      );
    }
    if (
      target.kind === "experience" &&
      typeof rewritten === "object" &&
      !Array.isArray(rewritten) &&
      "company" in rewritten
    ) {
      return (
        <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-slate-900 dark:text-slate-100">
          {rewritten.bullets.map((b) => (
            <li key={b.id}>{renderWithNeedHighlights(b.text)}</li>
          ))}
        </ul>
      );
    }
    if (
      target.kind === "project" &&
      typeof rewritten === "object" &&
      !Array.isArray(rewritten) &&
      "name" in rewritten
    ) {
      return (
        <div className="space-y-2 text-xs leading-relaxed text-slate-900 dark:text-slate-100">
          <p>{renderWithNeedHighlights(rewritten.description)}</p>
          {rewritten.bullets.length > 0 && (
            <ul className="list-disc space-y-1 pl-4">
              {rewritten.bullets.map((b) => (
                <li key={b.id}>{renderWithNeedHighlights(b.text)}</li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    if (target.kind === "skills" && Array.isArray(rewritten)) {
      return (
        <div className="space-y-1.5 text-xs text-slate-900 dark:text-slate-100">
          {rewritten.map((g) => (
            <div key={g.id}>
              <span className="font-semibold">{g.category}:</span> {g.items.join(", ")}
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div
      data-testid="ai-tailor-backdrop"
      onClick={() => {
        abortRef.current?.abort();
        onClose();
      }}
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 backdrop-blur-xs"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 sm:p-5 text-slate-900 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <Sparkles className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <h2 id={titleId} className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Tailor with AI · {getTargetHeading(target)}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Senior Recruiter rewrite calibrated to your target job description &amp; ATS audit
                findings.
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close AI Tailor"
            onClick={() => {
              abortRef.current?.abort();
              onClose();
            }}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Target Company Type
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {COMPANY_CALIBRATION[companyType]}
              </span>
            </div>
            <div
              role="group"
              aria-label="Target company type"
              className="mt-1.5 flex flex-wrap gap-1.5"
            >
              {COMPANY_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={companyType === opt.id}
                  onClick={() => setCompanyType(opt.id)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
                    companyType === opt.id
                      ? "border-indigo-600 bg-indigo-600 text-white shadow-2xs dark:border-indigo-500 dark:bg-indigo-500"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-xs sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-800/40">
            <div>
              <h3 className="font-semibold text-slate-700 dark:text-slate-200">
                Missing JD Keywords to Consider
              </h3>
              {missingKeywords.length === 0 ? (
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  No missing keywords identified from the current job description.
                </p>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-1" data-testid="tailor-missing-keywords">
                  {missingKeywords.map((kw) => (
                    <span
                      key={kw.keyword}
                      className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-200"
                    >
                      {kw.keyword}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="font-semibold text-slate-700 dark:text-slate-200">
                Section ATS Audit Findings
              </h3>
              {relevantFindings.length === 0 ? (
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  No ATS audit warnings on this section.
                </p>
              ) : (
                <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-600 dark:text-slate-300">
                  {relevantFindings.map((f) => (
                    <li key={f.id}>{f.message}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="ai-user-instruction"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Optional steering instruction (tone &amp; emphasis, max 300 chars)
            </label>
            <input
              id="ai-user-instruction"
              type="text"
              value={userInstruction}
              maxLength={300}
              onChange={(e) => setUserInstruction(e.target.value)}
              placeholder="e.g., Emphasize distributed systems reliability and mentoring"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-2xs focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {!hasApiKey ? (
            <div
              data-testid="zero-key-fallback"
              className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900/70 dark:bg-indigo-950/30"
            >
              <div>
                <h3 className="text-xs font-semibold text-indigo-950 dark:text-indigo-200">
                  Zero-Key Demo Mode — Copy Tailored Prompt or Add a Gemini API Key
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  No Gemini API key is configured. Copy the full Senior Recruiter prompt below to
                  paste into any AI chat (ChatGPT, Claude, Gemini), or configure a Gemini API key
                  for 1-click in-app Before/After rewrites.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  {copiedPrompt ? (
                    <>
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      Copied tailored prompt!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                      Copy Tailored Prompt
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <KeyRound className="h-3.5 w-3.5" aria-hidden />
                  Configure Gemini API Key
                </button>
              </div>

              {copiedPrompt && (
                <p
                  role="status"
                  data-testid="copy-prompt-status"
                  className="text-xs font-medium text-emerald-700 dark:text-emerald-300"
                >
                  Tailored Senior Recruiter prompt copied to clipboard.
                </p>
              )}

              {showPromptFallback && (
                <div>
                  <label
                    htmlFor="tailored-prompt-textarea"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                  >
                    Tailored prompt (read-only fallback)
                  </label>
                  <textarea
                    id="tailored-prompt-textarea"
                    aria-label="Tailored prompt"
                    readOnly
                    rows={5}
                    value={fullTailoredPrompt}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-[11px] text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleGenerateRewrite}
                    className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        Generating rewrite...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" aria-hidden />
                        {rewriteResult ? "Regenerate Rewrite" : "Generate Rewrite"}
                      </>
                    )}
                  </button>

                  {loading && (
                    <button
                      type="button"
                      onClick={handleCancelRequest}
                      className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300"
                    >
                      Cancel Request
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                    {copiedPrompt ? "Copied Tailored Prompt" : "Copy Tailored Prompt"}
                  </button>
                </div>

                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Model: <code className="font-mono">{settings.model}</code>
                </span>
              </div>

              {error && (
                <div
                  role="alert"
                  data-testid="ai-tailor-error"
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800 dark:border-red-800/80 dark:bg-red-950/60 dark:text-red-200"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p>{error}</p>
                  </div>
                </div>
              )}

              {rewriteResult && (
                <div className="space-y-4" data-testid="ai-review-panel">
                  {rewriteResult.qualificationNote && (
                    <div
                      data-testid="ai-qualification-note"
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/60 dark:text-amber-200"
                    >
                      <span className="font-semibold">Recruiter Qualification Note: </span>
                      {rewriteResult.qualificationNote}
                    </div>
                  )}

                  <div
                    data-testid="ai-diff-preview"
                    className="grid grid-cols-1 gap-3 md:grid-cols-2"
                  >
                    <div
                      data-testid="ai-diff-before"
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50"
                    >
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        1a. Before (Current)
                      </h3>
                      {renderBeforeContent()}
                    </div>

                    <div
                      data-testid="ai-diff-after"
                      className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900/70 dark:bg-emerald-950/20"
                    >
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                        1b. After (Tailored)
                      </h3>
                      {renderAfterContent()}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div
                      data-testid="ai-key-changes"
                      className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                    >
                      <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                        2. Key Changes &amp; Why
                      </h3>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-slate-600 dark:text-slate-300">
                        {rewriteResult.changes.map((change, idx) => (
                          <li key={idx}>{change}</li>
                        ))}
                      </ul>
                    </div>

                    <div
                      data-testid="ai-missing-numbers"
                      className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                    >
                      <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                        3. Missing Numbers Needed
                      </h3>
                      {rewriteResult.missingNumbers.length === 0 ? (
                        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                          No missing metric placeholders — existing numbers were preserved.
                        </p>
                      ) : (
                        <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs text-amber-800 dark:text-amber-300">
                          {rewriteResult.missingNumbers.map((num, idx) => (
                            <li key={idx}>{num}</li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </div>

                  <div
                    data-testid="ai-scan-test"
                    className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 dark:border-indigo-900/70 dark:bg-indigo-950/20"
                  >
                    <h3 className="text-xs font-semibold text-indigo-950 dark:text-indigo-200">
                      4. 3-Line Recruiter 6-Second Scan Test
                    </h3>
                    <dl className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                      <div className="rounded border border-indigo-100 bg-white/80 p-2 dark:border-indigo-900/60 dark:bg-slate-900/80">
                        <dt className="font-semibold text-slate-500 dark:text-slate-400">Who</dt>
                        <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                          {rewriteResult.scanTest.who}
                        </dd>
                      </div>
                      <div className="rounded border border-indigo-100 bg-white/80 p-2 dark:border-indigo-900/60 dark:bg-slate-900/80">
                        <dt className="font-semibold text-slate-500 dark:text-slate-400">
                          Seniority
                        </dt>
                        <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                          {rewriteResult.scanTest.seniority}
                        </dd>
                      </div>
                      <div className="rounded border border-indigo-100 bg-white/80 p-2 dark:border-indigo-900/60 dark:bg-slate-900/80">
                        <dt className="font-semibold text-slate-500 dark:text-slate-400">
                          Why This Job
                        </dt>
                        <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                          {rewriteResult.scanTest.whyThisJob}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                abortRef.current?.abort();
                onClose();
              }}
              className="rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Discard
            </button>

            {rewriteResult && (
              <button
                type="button"
                onClick={handleAccept}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Accept Rewrite
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
