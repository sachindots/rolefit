import { AlertTriangle, Check, CheckCircle2, Copy, Info, Sparkles, Target, XCircle } from "lucide-react";
import { useId, useState } from "react";
import { auditResume, type AtsAuditResult, type AuditFinding } from "../../lib/atsAudit";
import { analyzeJobDescription, type JdMatchResult, type KeywordChip } from "../../lib/jdEngine";
import { LIMITS } from "../../lib/schema";
import type { ResumeData } from "../../types/resume";

export interface JdMatchPanelProps {
  resume: ResumeData;
  jobDescription: string;
  onJobDescriptionChange: (jobDescription: string) => void;
  matchResult?: JdMatchResult;
  auditResult?: AtsAuditResult;
}

interface FindingContext {
  heading: string;
  bulletText: string | null;
}

const SECTION_LABELS: Record<AuditFinding["section"], string> = {
  contact: "Contact",
  summary: "Professional Summary",
  experience: "Experience",
  projects: "Projects",
  skills: "Skills",
  document: "Document Hygiene",
};

function resolveFindingContext(resume: ResumeData, finding: AuditFinding): FindingContext {
  if (finding.section === "experience" && finding.entryId) {
    const expIndex = resume.experience.findIndex((item) => item.id === finding.entryId);
    const exp = expIndex >= 0 ? resume.experience[expIndex] : undefined;
    if (exp) {
      const title =
        exp.role && exp.company
          ? `${exp.role} at ${exp.company}`
          : exp.role || exp.company || `Role ${expIndex + 1}`;
      const bulletIndex = finding.bulletId ? exp.bullets.findIndex((b) => b.id === finding.bulletId) : -1;
      const bullet = bulletIndex >= 0 ? exp.bullets[bulletIndex] : undefined;
      return {
        heading: `Experience · ${title}${bulletIndex >= 0 ? ` · Bullet ${bulletIndex + 1}` : ""}`,
        bulletText: bullet?.text.trim() || null,
      };
    }
  }

  if (finding.section === "projects" && finding.entryId) {
    const projIndex = resume.projects.findIndex((item) => item.id === finding.entryId);
    const proj = projIndex >= 0 ? resume.projects[projIndex] : undefined;
    if (proj) {
      const title = proj.name || `Project ${projIndex + 1}`;
      const bulletIndex = finding.bulletId ? proj.bullets.findIndex((b) => b.id === finding.bulletId) : -1;
      const bullet = bulletIndex >= 0 ? proj.bullets[bulletIndex] : undefined;
      return {
        heading: `Projects · ${title}${bulletIndex >= 0 ? ` · Bullet ${bulletIndex + 1}` : ""}`,
        bulletText: bullet?.text.trim() || null,
      };
    }
  }

  return {
    heading: SECTION_LABELS[finding.section],
    bulletText: null,
  };
}

function getScoreBadgeClasses(score: number, hasKeywords: boolean): string {
  if (!hasKeywords) {
    return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  }
  if (score >= 75) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-500/30";
  }
  if (score >= 45) {
    return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-500/30";
  }
  return "bg-red-50 text-red-700 ring-1 ring-red-600/20 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-500/30";
}

function getScoreBarClasses(score: number, hasKeywords: boolean): string {
  if (!hasKeywords) return "bg-slate-300 dark:bg-slate-700";
  if (score >= 75) return "bg-emerald-500";
  if (score >= 45) return "bg-amber-500";
  return "bg-red-500";
}

export function JdMatchPanel({
  resume,
  jobDescription,
  onJobDescriptionChange,
  matchResult,
  auditResult,
}: JdMatchPanelProps) {
  const jdTextareaId = useId();
  const [copiedKeyword, setCopiedKeyword] = useState<string | null>(null);

  const match = matchResult ?? analyzeJobDescription(resume, jobDescription);
  const audit = auditResult ?? auditResume(resume);
  const hasKeywords = match.totalKeywords > 0;

  const handleCopyKeyword = (keyword: string) => {
    setCopiedKeyword(keyword);
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      void navigator.clipboard.writeText(keyword).catch(() => {});
    }
  };

  const renderChip = (chip: KeywordChip, variant: "matched" | "missing") => {
    const isCopied = copiedKeyword === chip.keyword;
    const baseStyle =
      variant === "matched"
        ? "border-emerald-200 bg-emerald-50/90 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
        : "border-amber-200 bg-amber-50/90 text-amber-900 hover:bg-amber-100 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-900/60";

    const countStyle =
      variant === "matched"
        ? "bg-emerald-200/70 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200"
        : "bg-amber-200/70 text-amber-950 dark:bg-amber-900 dark:text-amber-200";

    return (
      <button
        key={chip.keyword}
        type="button"
        onClick={() => handleCopyKeyword(chip.keyword)}
        title={`Copy "${chip.keyword}" (${chip.count}x in JD)`}
        aria-label={`Copy keyword ${chip.keyword} (${chip.count} in JD)`}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${baseStyle}`}
      >
        <span>{chip.keyword}</span>
        <span className={`rounded-full px-1.5 py-0.2 text-[11px] font-semibold ${countStyle}`}>
          ×{chip.count}
        </span>
        {isCopied ? (
          <Check className="h-3 w-3 shrink-0" aria-hidden />
        ) : (
          <Copy className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
        )}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <section
        aria-label="Target job description"
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <label htmlFor={jdTextareaId} className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
              Job description
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Paste the target job posting to compute deterministic keyword match &amp; missing terms locally.
            </p>
          </div>
          {jobDescription.trim() !== "" && (
            <button
              type="button"
              onClick={() => onJobDescriptionChange("")}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Clear JD
            </button>
          )}
        </div>

        <textarea
          id={jdTextareaId}
          rows={6}
          value={jobDescription}
          maxLength={LIMITS.jobDescription}
          placeholder="Paste a target job description here (e.g. requirements for TypeScript, React, Node.js, C++, CI/CD, distributed systems)..."
          onChange={(e) => onJobDescriptionChange(e.target.value)}
          className="mt-2.5 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30"
        />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>
            {match.totalKeywords} technical &amp; domain keywords extracted
          </span>
          <span>
            {jobDescription.length}/{LIMITS.jobDescription} characters
          </span>
        </div>
      </section>

      <section
        aria-label="JD Keyword Match"
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">JD Keyword Match</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {hasKeywords
                ? `${match.matched.length} of ${match.totalKeywords} keywords matched`
                : "Paste a JD to score"}
            </span>
            <span
              data-testid="jd-match-score"
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${getScoreBadgeClasses(
                match.score,
                hasKeywords,
              )}`}
            >
              {match.score}%
            </span>
          </div>
        </div>

        <div
          role="progressbar"
          aria-label="JD keyword match score"
          aria-valuenow={match.score}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        >
          <div
            className={`h-full transition-all duration-200 ${getScoreBarClasses(match.score, hasKeywords)}`}
            style={{ width: `${match.score}%` }}
          />
        </div>

        {copiedKeyword !== null && (
          <p
            role="status"
            data-testid="copied-keyword-status"
            className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-800 dark:border-indigo-800/70 dark:bg-indigo-950/60 dark:text-indigo-200"
          >
            Copied "{copiedKeyword}" to clipboard.
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4">
          <div
            data-testid="matched-keywords"
            aria-label="Matched keywords"
            className="rounded-md border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Matched Keywords ({match.matched.length})
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Click any chip to copy</span>
            </div>
            {match.matched.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {match.matched.map((chip) => renderChip(chip, "matched"))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {hasKeywords
                  ? "No keywords from this job description match your resume yet."
                  : "Paste a job description above to see matched keywords."}
              </p>
            )}
          </div>

          <div
            data-testid="missing-keywords"
            aria-label="Missing keywords"
            className="rounded-md border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                <XCircle className="h-3.5 w-3.5" aria-hidden />
                Missing Keywords ({match.missing.length})
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Click to copy into your resume</span>
            </div>
            {match.missing.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {match.missing.map((chip) => renderChip(chip, "missing"))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {hasKeywords
                  ? "All extracted JD keywords are present in your resume."
                  : "Paste a job description above to identify missing keywords."}
              </p>
            )}
          </div>
        </div>
      </section>

      <section
        data-testid="ats-audit-section"
        aria-label="Bullet-Impact & ATS Audit"
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Bullet-Impact &amp; ATS Audit
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              {audit.counts.warning} {audit.counts.warning === 1 ? "warning" : "warnings"}
            </span>
            <span className="rounded-full bg-sky-50 px-2.5 py-0.5 font-medium text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
              {audit.counts.info} {audit.counts.info === 1 ? "suggestion" : "suggestions"}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {audit.bulletsAnalyzed} bullets · {audit.wordCount} words
            </span>
          </div>
        </div>

        {audit.findings.length === 0 ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-xs font-medium text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Every bullet has a strong opening verb, measurable outcome, and clean ATS formatting.
          </div>
        ) : (
          <ul className="mt-3 space-y-2.5" aria-label="ATS audit findings">
            {audit.findings.map((finding) => {
              const ctx = resolveFindingContext(resume, finding);
              const isWarning = finding.severity === "warning";
              return (
                <li
                  key={finding.id}
                  data-testid={`audit-finding-${finding.code}`}
                  className={`rounded-md border p-3 text-xs ${
                    isWarning
                      ? "border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/30"
                      : "border-sky-200 bg-sky-50/60 dark:border-sky-900/60 dark:bg-sky-950/30"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {isWarning ? (
                      <AlertTriangle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                        aria-hidden
                      />
                    ) : (
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{ctx.heading}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            isWarning
                              ? "bg-amber-200/70 text-amber-900 dark:bg-amber-900/70 dark:text-amber-200"
                              : "bg-sky-200/70 text-sky-900 dark:bg-sky-900/70 dark:text-sky-200"
                          }`}
                        >
                          {finding.severity}
                        </span>
                      </div>
                      {ctx.bulletText && (
                        <p className="truncate italic text-slate-600 dark:text-slate-400">
                          &ldquo;{ctx.bulletText}&rdquo;
                        </p>
                      )}
                      <p className="font-medium text-slate-800 dark:text-slate-200">{finding.message}</p>
                      <p className="text-slate-600 dark:text-slate-300">{finding.suggestion}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
