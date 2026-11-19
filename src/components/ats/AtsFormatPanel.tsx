import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { auditResume } from "../../lib/atsAudit";
import {
  scoreResumeForAts,
  type AtsBreakdownId,
  type AtsBreakdownLine,
  type AtsScore,
} from "../../lib/atsScore";
import {
  FORMAT_PROFILE_LIST,
  checkFormatProfile,
  type FormatCheckItem,
  type FormatCheckStatus,
  type FormatProfileId,
} from "../../lib/formatProfiles";
import { analyzeJobDescription } from "../../lib/jdEngine";
import type { PageSize, ResumeData, TemplateId } from "../../types/resume";

export type EditorSectionTarget =
  | "Contact"
  | "Professional Summary"
  | "Experience"
  | "Projects"
  | "Skills"
  | "Education";

export interface AtsFixItem {
  id: string;
  label: string;
  detail: string;
  pointsLost: number;
  section: EditorSectionTarget;
}

export interface AtsFormatPanelProps {
  resume: ResumeData;
  jobDescription: string;
  template: TemplateId;
  pageSize: PageSize;
  atsScore?: AtsScore;
  defaultProfileId?: FormatProfileId;
  onJumpToSection?: (section: EditorSectionTarget) => void;
}

const AUDIT_SECTION_TO_EDITOR: Record<string, EditorSectionTarget> = {
  contact: "Contact",
  summary: "Professional Summary",
  experience: "Experience",
  projects: "Projects",
  skills: "Skills",
  document: "Experience",
};

function resolveBulletSection(resume: ResumeData): EditorSectionTarget {
  return resume.experience.length === 0 && resume.projects.length > 0 ? "Projects" : "Experience";
}

export function mapBreakdownToEditorSection(
  id: AtsBreakdownId,
  resume: ResumeData,
): EditorSectionTarget {
  switch (id) {
    case "parse-readiness":
      return "Contact";
    case "section-structure": {
      const hasExp = resume.experience.some(
        (e) => e.company.trim() || e.role.trim() || e.bullets.some((b) => b.text.trim()),
      );
      if (!hasExp) return "Experience";
      const hasEdu = resume.education.some(
        (e) => e.institution.trim() || e.degree.trim() || e.details.trim(),
      );
      if (!hasEdu) return "Education";
      const hasSkills = resume.skills.some((g) => g.items.some((item) => item.trim().length > 0));
      if (!hasSkills) return "Skills";
      return "Experience";
    }
    case "keyword-match":
      return "Skills";
    case "bullet-quality":
      return resolveBulletSection(resume);
    case "length-density":
      return "Experience";
  }
}

export function mapCheckToEditorSection(
  check: FormatCheckItem,
  resume: ResumeData,
): EditorSectionTarget | null {
  switch (check.id) {
    case "harvard-reverse-chronological":
    case "harvard-bullets-per-role":
    case "uk-reverse-chronological":
    case "uk-page-length":
    case "faang-page-length":
      return "Experience";
    case "harvard-education-order":
      return "Education";
    case "harvard-action-verbs":
    case "harvard-bullet-length":
    case "uk-action-bullets":
    case "faang-quantified-bullets":
    case "faang-xyz-bullets":
      return resolveBulletSection(resume);
    case "harvard-no-first-person":
      return check.message.toLowerCase().includes("summary")
        ? "Professional Summary"
        : resolveBulletSection(resume);
    case "harvard-no-photo-graphics":
    case "uk-no-protected-fields":
    case "faang-no-tables-images":
      return "Contact";
    case "faang-skills-section":
      return "Skills";
    case "harvard-font-margins":
    case "harvard-multipage-footer":
    case "harvard-pdf-output":
    case "uk-a4-page-size":
    case "faang-single-column":
    default:
      return null;
  }
}

function buildBreakdownFixDetail(
  line: AtsBreakdownLine,
  resume: ResumeData,
  jobDescription?: string,
): string {
  switch (line.id) {
    case "parse-readiness":
      return `${line.reason} Add valid name, email, phone, and location in Contact.`;
    case "section-structure":
      return `${line.reason} Complete Experience, Education, and Skills with parseable dates.`;
    case "keyword-match": {
      const match = analyzeJobDescription(resume, jobDescription ?? "");
      if (match.missing.length > 0) {
        const topMissing = match.missing
          .slice(0, 4)
          .map((chip) => chip.keyword)
          .join(", ");
        return `${line.reason} Add missing JD keywords (${topMissing}) where accurate.`;
      }
      return line.reason;
    }
    case "bullet-quality":
      return `${line.reason} Start bullets with strong action verbs and include measurable outcomes.`;
    case "length-density":
      return line.reason;
  }
}

export function getTopAtsFixes(
  resume: ResumeData,
  jobDescription?: string,
  limit = 3,
): AtsFixItem[] {
  if (limit <= 0) return [];
  const score = scoreResumeForAts(resume, { jobDescription });
  const fixes: AtsFixItem[] = score.breakdown
    .filter((line) => line.max > 0 && line.score < line.max)
    .map((line) => ({
      id: `fix-${line.id}`,
      label: line.label,
      detail: buildBreakdownFixDetail(line, resume, jobDescription),
      pointsLost: line.max - line.score,
      section: mapBreakdownToEditorSection(line.id, resume),
    }))
    .sort((a, b) => b.pointsLost - a.pointsLost);

  if (fixes.length < limit) {
    const audit = auditResume(resume);
    const seenIds = new Set(fixes.map((f) => f.id));
    for (const finding of audit.findings) {
      if (fixes.length >= limit) break;
      const fixId = `fix-audit-${finding.id}`;
      if (seenIds.has(fixId)) continue;
      seenIds.add(fixId);
      fixes.push({
        id: fixId,
        label: AUDIT_SECTION_TO_EDITOR[finding.section] ?? "Experience",
        detail: `${finding.message} ${finding.suggestion}`,
        pointsLost: finding.severity === "warning" ? 3 : 1,
        section: AUDIT_SECTION_TO_EDITOR[finding.section] ?? "Experience",
      });
    }
  }

  return fixes.slice(0, limit);
}

function getOverallScoreBand(total: number): {
  label: string;
  status: FormatCheckStatus;
  badgeClasses: string;
  barClasses: string;
} {
  if (total >= 75) {
    return {
      label: "Strong",
      status: "pass",
      badgeClasses:
        "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/20 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-500/30",
      barClasses: "bg-emerald-500",
    };
  }
  if (total >= 45) {
    return {
      label: "Needs work",
      status: "warn",
      badgeClasses:
        "bg-amber-50 text-amber-800 ring-1 ring-amber-600/20 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-500/30",
      barClasses: "bg-amber-500",
    };
  }
  return {
    label: "Critical gaps",
    status: "fail",
    badgeClasses:
      "bg-red-50 text-red-800 ring-1 ring-red-600/20 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-500/30",
    barClasses: "bg-red-500",
  };
}

function getBreakdownStatus(line: AtsBreakdownLine): {
  status: FormatCheckStatus | "inactive";
  text: string;
  barClasses: string;
  pillClasses: string;
} {
  if (line.max === 0) {
    return {
      status: "inactive",
      text: "No JD",
      barClasses: "bg-slate-300 dark:bg-slate-700",
      pillClasses: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    };
  }
  const ratio = line.score / line.max;
  if (ratio >= 0.8) {
    return {
      status: "pass",
      text: "Pass",
      barClasses: "bg-emerald-500",
      pillClasses:
        "bg-emerald-100/80 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300",
    };
  }
  if (ratio >= 0.45) {
    return {
      status: "warn",
      text: "Warn",
      barClasses: "bg-amber-500",
      pillClasses: "bg-amber-100/80 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300",
    };
  }
  return {
    status: "fail",
    text: "Fail",
    barClasses: "bg-red-500",
    pillClasses: "bg-red-100/80 text-red-800 dark:bg-red-950/70 dark:text-red-300",
  };
}

const CHECK_STATUS_META: Record<
  FormatCheckStatus,
  {
    label: string;
    cardClasses: string;
    badgeClasses: string;
  }
> = {
  pass: {
    label: "Pass",
    cardClasses:
      "border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20",
    badgeClasses:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300",
  },
  warn: {
    label: "Warn",
    cardClasses:
      "border-amber-200/90 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/25",
    badgeClasses: "bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300",
  },
  fail: {
    label: "Fail",
    cardClasses: "border-red-200/90 bg-red-50/50 dark:border-red-900/60 dark:bg-red-950/25",
    badgeClasses: "bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300",
  },
};

function StatusIcon({ status, className = "h-4 w-4 shrink-0" }: { status: FormatCheckStatus; className?: string }) {
  if (status === "pass") {
    return <CheckCircle2 className={`${className} text-emerald-600 dark:text-emerald-400`} aria-hidden />;
  }
  if (status === "warn") {
    return <AlertTriangle className={`${className} text-amber-600 dark:text-amber-400`} aria-hidden />;
  }
  return <XCircle className={`${className} text-red-600 dark:text-red-400`} aria-hidden />;
}

export function AtsFormatPanel({
  resume,
  jobDescription,
  template,
  pageSize,
  atsScore,
  defaultProfileId = "harvard",
  onJumpToSection,
}: AtsFormatPanelProps) {
  const [profileId, setProfileId] = useState<FormatProfileId>(defaultProfileId);

  const score = atsScore ?? scoreResumeForAts(resume, { jobDescription });
  const formatResult = checkFormatProfile(resume, { template, pageSize }, profileId);
  const topFixes = getTopAtsFixes(resume, jobDescription, 3);
  const band = getOverallScoreBand(score.total);

  return (
    <div className="space-y-4" data-testid="ats-format-panel">
      <section
        aria-label="ATS Readiness Score"
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                ATS Readiness Score
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {score.hasJobDescription
                  ? "Scored with active job description (weights: 25 / 20 / 25 / 20 / 10)."
                  : "No job description active — keyword weight redistributed (weights: 33 / 27 / 0 / 27 / 13)."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              data-testid="ats-score-band"
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${band.badgeClasses}`}
            >
              <StatusIcon status={band.status} className="h-3.5 w-3.5 shrink-0" />
              <span>{band.label}</span>
            </span>
            <span
              data-testid="ats-total-score"
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${band.badgeClasses}`}
            >
              {score.total}/100
            </span>
          </div>
        </div>

        <div
          role="progressbar"
          aria-label="Overall ATS readiness score"
          aria-valuenow={score.total}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        >
          <div
            className={`h-full transition-all duration-200 ${band.barClasses}`}
            style={{ width: `${score.total}%` }}
          />
        </div>

        <ul
          data-testid="ats-breakdown-list"
          aria-label="ATS score breakdown"
          className="mt-4 space-y-3"
        >
          {score.breakdown.map((line) => {
            const meta = getBreakdownStatus(line);
            const pct = line.max > 0 ? Math.round((line.score / line.max) * 100) : 0;
            const targetSection =
              line.max > 0 && line.score < line.max
                ? mapBreakdownToEditorSection(line.id, resume)
                : null;

            return (
              <li
                key={line.id}
                data-testid={`ats-breakdown-${line.id}`}
                className="rounded-md border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {meta.status !== "inactive" && (
                      <StatusIcon status={meta.status} className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {line.label}
                    </span>
                    <span
                      data-testid={`ats-breakdown-status-${line.id}`}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.pillClasses}`}
                    >
                      {meta.text}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      data-testid={`ats-breakdown-score-${line.id}`}
                      className=" font-mono text-xs font-semibold text-slate-800 dark:text-slate-200"
                    >
                      {line.score}/{line.max} pts
                    </span>
                    {targetSection && (
                      <button
                        type="button"
                        data-testid={`ats-breakdown-jump-${line.id}`}
                        onClick={() => onJumpToSection?.(targetSection)}
                        className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-950/60"
                      >
                        <span>Edit {targetSection}</span>
                        <ArrowRight className="h-3 w-3" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>

                <div
                  role="progressbar"
                  aria-label={`${line.label} score`}
                  aria-valuenow={line.score}
                  aria-valuemin={0}
                  aria-valuemax={line.max}
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800"
                >
                  <div
                    className={`h-full transition-all duration-200 ${meta.barClasses}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">{line.reason}</p>
              </li>
            );
          })}
        </ul>

        {topFixes.length > 0 && (
          <div
            data-testid="ats-top-fixes"
            className="mt-4 rounded-md border border-indigo-200/80 bg-indigo-50/50 p-3 dark:border-indigo-900/60 dark:bg-indigo-950/30"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">
              Top {topFixes.length} {topFixes.length === 1 ? "Fix" : "Fixes"} to Raise Your Score
            </h3>
            <ol className="mt-2 space-y-2 text-xs">
              {topFixes.map((fix, idx) => (
                <li
                  key={fix.id}
                  className="flex flex-wrap items-start justify-between gap-2 text-slate-800 dark:text-slate-200"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold">
                      {idx + 1}. {fix.label}:
                    </span>{" "}
                    <span>{fix.detail}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onJumpToSection?.(fix.section)}
                    className="inline-flex shrink-0 items-center gap-1 rounded border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-950/60"
                  >
                    <span>Go to {fix.section}</span>
                    <ArrowRight className="h-3 w-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <section
        aria-label="Format Standards & Profile Checks"
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Format Standards &amp; Profile Checks
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Compare against Harvard, London UK CV, and FAANG format profiles.
              </p>
            </div>
          </div>

          <div
            role="group"
            aria-label="Format profile"
            className="inline-flex flex-wrap rounded-md border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800"
          >
            {FORMAT_PROFILE_LIST.map((profile) => {
              const selected = profileId === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  data-testid={`format-profile-${profile.id}`}
                  aria-pressed={selected}
                  onClick={() => setProfileId(profile.id)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
                    selected
                      ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                  }`}
                >
                  {profile.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 rounded-md border border-slate-200/80 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {formatResult.profile.label} Standard
              </p>
              <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                {formatResult.profile.description}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                data-testid="format-profile-score"
                className="rounded-full bg-indigo-50 px-2.5 py-0.5 font-bold text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300"
              >
                {formatResult.score}% profile fit
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                {formatResult.counts.pass} pass
              </span>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                {formatResult.counts.warn} warn
              </span>
              <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-800 dark:bg-red-950/60 dark:text-red-300">
                {formatResult.counts.fail} fail
              </span>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Sources: {formatResult.profile.sources}
            </span>
            <span data-testid="format-page-estimate" className="inline-flex items-center gap-1">
              <FileCheck2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Est. ~{formatResult.pageEstimate.exactPages} page
              {formatResult.pageEstimate.exactPages === 1 ? "" : "s"} (
              {formatResult.pageEstimate.wordCount} words at {formatResult.pageEstimate.wordsPerPage}{" "}
              words/page)
            </span>
          </div>
        </div>

        <ul
          data-testid="format-checks-list"
          aria-label={`${formatResult.profile.label} format checks`}
          className="mt-3 space-y-2.5"
        >
          {formatResult.checks.map((check) => {
            const meta = CHECK_STATUS_META[check.status];
            const targetSection =
              check.status !== "pass" ? mapCheckToEditorSection(check, resume) : null;
            const isOfficial = check.sourceKind === "official";

            return (
              <li
                key={check.id}
                data-testid={`format-check-${check.id}`}
                data-status={check.status}
                className={`rounded-md border p-3 text-xs ${meta.cardClasses}`}
              >
                <div className="flex items-start gap-2.5">
                  <StatusIcon status={check.status} className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          data-testid={`format-check-status-${check.id}`}
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.badgeClasses}`}
                        >
                          {meta.label}
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {check.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          data-testid={`format-check-source-kind-${check.id}`}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            isOfficial
                              ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300"
                              : "bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {isOfficial ? "Official" : "Convention"}
                        </span>
                        <span
                          data-testid={`format-check-source-${check.id}`}
                          className="text-[11px] text-slate-500 dark:text-slate-400"
                        >
                          {check.source}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-slate-700 dark:text-slate-200">{check.message}</p>
                      {targetSection && (
                        <button
                          type="button"
                          data-testid={`format-check-jump-${check.id}`}
                          onClick={() => onJumpToSection?.(targetSection)}
                          className="inline-flex shrink-0 items-center gap-1 rounded border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-950/60"
                        >
                          <span>Go to {targetSection} in Editor</span>
                          <ArrowRight className="h-3 w-3" aria-hidden />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
