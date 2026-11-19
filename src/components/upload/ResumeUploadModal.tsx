import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  FileUp,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { enhanceExtractionWithGemini } from "../../lib/aiRewrite";
import type { AiSettings } from "../../lib/aiSettings";
import { scoreResumeForAts } from "../../lib/atsScore";
import {
  MAX_RESUME_FILE_BYTES,
  extractResumeText,
  type ResumeFileType,
} from "../../lib/resumeExtract";
import { parseResumeText } from "../../lib/resumeParser";
import type { ResumeData } from "../../types/resume";
import { getTopAtsFixes } from "../ats/AtsFormatPanel";

export interface ResumeUploadModalProps {
  open: boolean;
  aiSettings: AiSettings;
  jobDescription?: string;
  onClose: () => void;
  onApply: (resume: ResumeData, fileName: string) => void;
}

interface ReviewDraft {
  fileName: string;
  fileType: ResumeFileType;
  rawText: string;
  extractWarnings: string[];
  resume: ResumeData;
  warnings: string[];
  unmappedLines: string[];
  enhancedWithGemini: boolean;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const MAX_MB = Math.round(MAX_RESUME_FILE_BYTES / (1024 * 1024));

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.filter((item) => item.trim().length > 0)));
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

function formatContactEntries(resume: ResumeData): Array<{ label: string; value: string }> {
  const { contact } = resume;
  return [
    { label: "Name", value: contact.fullName },
    { label: "Headline", value: contact.headline },
    { label: "Email", value: contact.email },
    { label: "Phone", value: contact.phone },
    { label: "Location", value: contact.location },
    { label: "Website", value: contact.website },
    { label: "LinkedIn", value: contact.linkedin },
    { label: "GitHub", value: contact.github },
  ].filter((entry) => entry.value.trim().length > 0);
}

export function ResumeUploadModal({
  open,
  aiSettings,
  jobDescription,
  onClose,
  onApply,
}: ResumeUploadModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chooseFileButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const requestIdRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [unmappedOpen, setUnmappedOpen] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);

  const aiActive = aiSettings.source !== "none" && Boolean(aiSettings.apiKey);

  useEffect(() => {
    if (!open) {
      requestIdRef.current += 1;
      return;
    }
    setIsDragging(false);
    setExtracting(false);
    setUploadError(null);
    setDraft(null);
    setUnmappedOpen(false);
    setEnhancing(false);
    setEnhanceError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    chooseFileButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
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

  if (!open) return null;

  const processFile = async (file: File) => {
    const reqId = ++requestIdRef.current;
    setUploadError(null);
    setEnhanceError(null);
    setExtracting(true);

    const extracted = await extractResumeText(file);
    if (reqId !== requestIdRef.current) return;

    if (!extracted.ok) {
      setExtracting(false);
      setUploadError(extracted.error);
      return;
    }

    const parsed = parseResumeText(extracted.text);
    const combinedWarnings = dedupe([...extracted.warnings, ...parsed.warnings]);

    setDraft({
      fileName: file.name,
      fileType: extracted.fileType,
      rawText: extracted.text,
      extractWarnings: extracted.warnings,
      resume: parsed.resume,
      warnings: combinedWarnings,
      unmappedLines: parsed.unmappedLines,
      enhancedWithGemini: false,
    });
    setUnmappedOpen(false);
    setExtracting(false);
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void processFile(file);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    void processFile(file);
  };

  const handleChooseAnother = () => {
    requestIdRef.current += 1;
    setDraft(null);
    setUploadError(null);
    setEnhanceError(null);
    setEnhancing(false);
    setUnmappedOpen(false);
  };

  const handleEnhanceWithGemini = async () => {
    if (!draft || !aiActive || enhancing) return;
    const reqId = ++requestIdRef.current;
    setEnhancing(true);
    setEnhanceError(null);

    const result = await enhanceExtractionWithGemini(draft.rawText, aiSettings);
    if (reqId !== requestIdRef.current) return;

    setEnhancing(false);
    if (!result.ok) {
      setEnhanceError(result.error);
      return;
    }

    setDraft((prev) =>
      prev
        ? {
            ...prev,
            resume: result.resume,
            warnings: dedupe([...prev.extractWarnings, ...result.warnings]),
            unmappedLines: [],
            enhancedWithGemini: true,
          }
        : null,
    );
  };

  const handleApply = () => {
    if (!draft || enhancing) return;
    onApply(draft.resume, draft.fileName);
  };

  const contactEntries = draft ? formatContactEntries(draft.resume) : [];
  const totalExperienceBullets = draft
    ? draft.resume.experience.reduce((sum, item) => sum + item.bullets.length, 0)
    : 0;
  const totalProjectBullets = draft
    ? draft.resume.projects.reduce((sum, item) => sum + item.bullets.length, 0)
    : 0;
  const totalSkillItems = draft
    ? draft.resume.skills.reduce((sum, group) => sum + group.items.length, 0)
    : 0;
  const draftAtsScore = draft ? scoreResumeForAts(draft.resume, { jobDescription }) : null;
  const draftTopFixes = draft ? getTopAtsFixes(draft.resume, jobDescription, 3) : [];

  return (
    <div
      data-testid="resume-upload-backdrop"
      onClick={onClose}
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <FileUp className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                {draft ? "Review Extracted Resume" : "Upload Resume"}
              </h2>
              <p
                id={descriptionId}
                className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300"
              >
                {draft
                  ? "Inspect parsed sections and warnings before applying to the editor."
                  : "Import a .pdf, .docx, or .txt resume to prefill the editor."}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close upload modal"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!draft ? (
            <div className="space-y-4">
              <div
                data-testid="resume-dropzone"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                  isDragging
                    ? "border-indigo-500 bg-indigo-50/70 dark:border-indigo-400 dark:bg-indigo-950/40"
                    : "border-slate-300 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/40"
                }`}
              >
                {extracting ? (
                  <div className="flex flex-col items-center gap-2" role="status">
                    <Loader2 className="h-7 w-7 animate-spin text-indigo-600 dark:text-indigo-400" aria-hidden />
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      Extracting and parsing resume locally…
                    </p>
                  </div>
                ) : (
                  <>
                    <FileText className="h-8 w-8 text-slate-400 dark:text-slate-500" aria-hidden />
                    <p className="mt-3 text-sm font-medium text-slate-800 dark:text-slate-200">
                      Drag and drop your resume here
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Supports <span className="font-mono">.pdf</span>,{" "}
                      <span className="font-mono">.docx</span>, and{" "}
                      <span className="font-mono">.txt</span> up to {MAX_MB} MB
                    </p>
                    <button
                      ref={chooseFileButtonRef}
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    >
                      <FileUp className="h-3.5 w-3.5" aria-hidden />
                      Choose file
                    </button>
                  </>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  aria-label="Upload resume file"
                  data-testid="resume-upload-input"
                  className="sr-only"
                  onChange={handleFileInputChange}
                />
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200">
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
                <span>
                  Parsed 100% locally in your browser. Files never leave your device unless you
                  explicitly run Gemini-enhanced extraction.
                </span>
              </div>

              {uploadError && (
                <div
                  role="alert"
                  data-testid="upload-error"
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800 dark:border-red-800/80 dark:bg-red-950/60 dark:text-red-200"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 break-words">{uploadError}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/60">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden />
                  <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {draft.fileName}
                  </span>
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    {draft.fileType}
                  </span>
                  {draft.enhancedWithGemini && (
                    <span
                      data-testid="gemini-enhanced-badge"
                      className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300"
                    >
                      <CheckCircle2 className="h-3 w-3" aria-hidden />
                      Enhanced with Gemini
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleChooseAnother}
                  disabled={enhancing}
                  className="text-xs font-medium text-indigo-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:opacity-50 dark:text-indigo-400"
                >
                  Choose another file
                </button>
              </div>

              {draft.warnings.length > 0 && (
                <div
                  role="status"
                  data-testid="upload-warnings"
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/50 dark:text-amber-200"
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>Extraction warnings ({draft.warnings.length})</span>
                  </div>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5">
                    {draft.warnings.map((warning, idx) => (
                      <li key={idx} className="break-words">
                        {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {draftAtsScore && (
                <section
                  data-testid="upload-ats-summary"
                  aria-label="Uploaded resume ATS score and top fixes"
                  className="rounded-lg border border-indigo-200/80 bg-indigo-50/50 p-3 dark:border-indigo-900/70 dark:bg-indigo-950/30"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">
                        ATS Readiness Score
                      </h3>
                      <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                        {draftAtsScore.hasJobDescription
                          ? "Scored with active job description keyword matching."
                          : "General ATS readiness (no job description active)."}
                      </p>
                    </div>
                    <span
                      data-testid="upload-ats-score"
                      className="inline-flex items-center rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-bold text-white"
                    >
                      {draftAtsScore.total}/100
                    </span>
                  </div>

                  {draftTopFixes.length > 0 ? (
                    <div className="mt-2.5 border-t border-indigo-200/60 pt-2 dark:border-indigo-900/60">
                      <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                        Top {draftTopFixes.length} {draftTopFixes.length === 1 ? "fix" : "fixes"}:
                      </p>
                      <ol
                        data-testid="upload-ats-top-fixes"
                        className="mt-1 list-decimal space-y-1 pl-4 text-xs text-slate-700 dark:text-slate-200"
                      >
                        {draftTopFixes.map((fix) => (
                          <li key={fix.id} className="break-words">
                            <span className="font-semibold">{fix.label}:</span> {fix.detail}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : (
                    <p
                      data-testid="upload-ats-top-fixes"
                      className="mt-2 text-xs font-medium text-emerald-800 dark:text-emerald-300"
                    >
                      All ATS readiness checks pass.
                    </p>
                  )}
                </section>
              )}

              <div
                data-testid="upload-review-summary"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Contact ({contactEntries.length} fields)
                  </h3>
                  {contactEntries.length > 0 ? (
                    <dl className="mt-2 space-y-1 text-xs">
                      {contactEntries.slice(0, 5).map((entry) => (
                        <div key={entry.label} className="flex gap-1.5">
                          <dt className="shrink-0 font-medium text-slate-500 dark:text-slate-400">
                            {entry.label}:
                          </dt>
                          <dd className="min-w-0 truncate text-slate-800 dark:text-slate-200">
                            {entry.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      No contact details detected.
                    </p>
                  )}
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Summary ({countWords(draft.resume.summary)} words)
                  </h3>
                  {draft.resume.summary.trim() ? (
                    <p className="mt-2 line-clamp-4 break-words text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                      {draft.resume.summary}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      No summary section detected.
                    </p>
                  )}
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Experience ({draft.resume.experience.length}{" "}
                    {draft.resume.experience.length === 1 ? "role" : "roles"} ·{" "}
                    {totalExperienceBullets}{" "}
                    {totalExperienceBullets === 1 ? "bullet" : "bullets"})
                  </h3>
                  {draft.resume.experience.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs text-slate-800 dark:text-slate-200">
                      {draft.resume.experience.slice(0, 4).map((item) => (
                        <li key={item.id} className="truncate">
                          {[item.role, item.company].filter(Boolean).join(" — ") || "Untitled role"}
                        </li>
                      ))}
                      {draft.resume.experience.length > 4 && (
                        <li className="text-slate-500 dark:text-slate-400">
                          +{draft.resume.experience.length - 4} more
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      No experience entries detected.
                    </p>
                  )}
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Projects ({draft.resume.projects.length}{" "}
                    {draft.resume.projects.length === 1 ? "project" : "projects"} ·{" "}
                    {totalProjectBullets}{" "}
                    {totalProjectBullets === 1 ? "bullet" : "bullets"})
                  </h3>
                  {draft.resume.projects.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs text-slate-800 dark:text-slate-200">
                      {draft.resume.projects.slice(0, 4).map((item) => (
                        <li key={item.id} className="truncate">
                          {item.name || "Untitled project"}
                        </li>
                      ))}
                      {draft.resume.projects.length > 4 && (
                        <li className="text-slate-500 dark:text-slate-400">
                          +{draft.resume.projects.length - 4} more
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      No projects detected.
                    </p>
                  )}
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Skills ({draft.resume.skills.length}{" "}
                    {draft.resume.skills.length === 1 ? "group" : "groups"} · {totalSkillItems}{" "}
                    {totalSkillItems === 1 ? "skill" : "skills"})
                  </h3>
                  {draft.resume.skills.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs text-slate-800 dark:text-slate-200">
                      {draft.resume.skills.slice(0, 4).map((group) => (
                        <li key={group.id} className="truncate">
                          <span className="font-medium">{group.category || "Skills"}:</span>{" "}
                          {group.items.join(", ")}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      No skill groups detected.
                    </p>
                  )}
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Education ({draft.resume.education.length}{" "}
                    {draft.resume.education.length === 1 ? "entry" : "entries"})
                  </h3>
                  {draft.resume.education.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs text-slate-800 dark:text-slate-200">
                      {draft.resume.education.slice(0, 4).map((item) => (
                        <li key={item.id} className="truncate">
                          {[item.degree, item.institution].filter(Boolean).join(" — ") ||
                            "Untitled education"}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      No education entries detected.
                    </p>
                  )}
                </section>
              </div>

              {draft.unmappedLines.length > 0 && (
                <div
                  data-testid="unmapped-lines-section"
                  className="rounded-lg border border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <button
                    type="button"
                    aria-expanded={unmappedOpen}
                    onClick={() => setUnmappedOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {unmappedOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Unmapped lines ({draft.unmappedLines.length})
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {unmappedOpen ? "Hide" : "Show"}
                    </span>
                  </button>
                  {unmappedOpen && (
                    <ul
                      data-testid="unmapped-lines-list"
                      className="max-h-40 space-y-1 overflow-y-auto border-t border-slate-200 px-3 py-2 font-mono text-[11px] text-slate-600 dark:border-slate-800 dark:text-slate-300"
                    >
                      {draft.unmappedLines.map((line, idx) => (
                        <li key={idx} className="break-words">
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-indigo-200/80 bg-indigo-50/60 p-3 dark:border-indigo-900/70 dark:bg-indigo-950/30">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Optional AI structuring
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                      {aiActive
                        ? "Use Gemini to restructure complex or multi-column layouts without inventing facts."
                        : "Configure a Gemini API key in AI Settings to enable Gemini-enhanced extraction."}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="enhance-gemini-button"
                    disabled={!aiActive || enhancing}
                    title={
                      aiActive
                        ? "Restructure extracted text using your configured Gemini API key"
                        : "Configure a Gemini API key in AI Settings to enable"
                    }
                    onClick={() => void handleEnhanceWithGemini()}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-2xs transition-colors hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-700 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-950/60"
                  >
                    {enhancing ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        Enhancing…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" aria-hidden />
                        Enhance extraction with Gemini
                      </>
                    )}
                  </button>
                </div>

                {enhanceError && (
                  <div
                    role="alert"
                    data-testid="gemini-enhance-error"
                    className="mt-2.5 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-800 dark:border-red-800/80 dark:bg-red-950/60 dark:text-red-200"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 break-words">{enhanceError}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {draft
              ? "Replaces resume fields only. Job description, template, page size, and theme are kept."
              : "Nothing in your workspace changes until you review and apply."}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            {draft && (
              <button
                type="button"
                data-testid="apply-resume-button"
                disabled={enhancing}
                onClick={handleApply}
                className="rounded-md bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apply to Editor
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
