import type { AuditableResume } from "./jdEngine";

export type AuditSeverity = "warning" | "info";
export type AuditSection = "contact" | "summary" | "experience" | "projects" | "skills" | "document";

export interface AuditFinding {
  id: string;
  code: string;
  severity: AuditSeverity;
  section: AuditSection;
  entryId?: string;
  bulletId?: string;
  message: string;
  suggestion: string;
}

export interface AtsAuditResult {
  findings: AuditFinding[];
  counts: { warning: number; info: number; total: number };
  bulletsAnalyzed: number;
  wordCount: number;
}

export const MIN_BULLET_CHARS = 30;
export const MAX_BULLET_CHARS = 220;
export const MIN_WORDS = 150;
export const MAX_WORDS = 900;

const WEAK_OPENINGS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^responsible for\b/i, "Led, Owned, or Delivered"],
  [/^duties (?:included|include)\b/i, "Delivered, Managed, or Built"],
  [/^tasked with\b/i, "Executed, Delivered, or Drove"],
  [/^worked (?:on|with)\b/i, "Built, Developed, or Shipped"],
  [/^helped\b/i, "Accelerated, Enabled, or Improved"],
  [/^assisted\b/i, "Supported, Contributed, or Co-delivered"],
  [/^participated in\b/i, "Contributed to, Led, or Coordinated"],
  [/^involved in\b/i, "Drove, Led, or Implemented"],
  [/^(?:was|were) (?:responsible|involved|part of)\b/i, "Led, Owned, or Built"],
  [/^(?:contributed to|supported)\b/i, "Built, Delivered, or Improved"],
];

const METRIC = /\d|[%$]|\b(?:(?:thousand|million|billion)s?|dozens?|hundreds?|double[ds]?|tripled|halved)\b/i;

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function stripBulletMarker(text: string): string {
  return text.trim().replace(/^[\u2022\-*\u2013\u2014]+\s*/, "");
}

export function auditResume(resume: AuditableResume): AtsAuditResult {
  const findings: AuditFinding[] = [];
  const add = (f: Omit<AuditFinding, "id">) => findings.push({ ...f, id: `${f.code}:${f.entryId ?? f.section}:${f.bulletId ?? ""}` });

  const contactFields: ReadonlyArray<readonly [keyof AuditableResume["contact"], string]> = [
    ["fullName", "name"],
    ["email", "email"],
    ["phone", "phone number"],
    ["location", "location"],
  ];
  for (const [field, label] of contactFields) {
    if (!resume.contact[field].trim()) {
      add({
        code: `missing-${field}`,
        severity: "warning",
        section: "contact",
        message: `Missing ${label}.`,
        suggestion: `Add your ${label} so recruiters and ATS parsers can identify and reach you.`,
      });
    }
  }

  if (!resume.summary.trim()) {
    add({
      code: "missing-summary",
      severity: "info",
      section: "summary",
      message: "No professional summary.",
      suggestion: "Add a 2-3 sentence summary with your role, years of experience, and top skills.",
    });
  }

  if (!resume.skills.some((group) => group.items.some((item) => item.trim()))) {
    add({
      code: "empty-skills",
      severity: "warning",
      section: "skills",
      message: "Skills section is empty.",
      suggestion: "List the tools and technologies you use; ATS keyword matching relies on them.",
    });
  }

  const bullets = [
    ...resume.experience.map((e) => ({ section: "experience" as const, entryId: e.id, bullets: e.bullets })),
    ...resume.projects.map((p) => ({ section: "projects" as const, entryId: p.id, bullets: p.bullets })),
  ];
  let bulletsAnalyzed = 0;
  for (const { section, entryId, bullets: list } of bullets) {
    for (const bullet of list) {
      bulletsAnalyzed++;
      const text = stripBulletMarker(bullet.text);
      const ref = { section, entryId, bulletId: bullet.id };

      if (text.length < MIN_BULLET_CHARS) {
        add({
          ...ref,
          code: "bullet-too-short",
          severity: "warning",
          message: `Bullet is too short (${text.length} chars).`,
          suggestion: `Expand to at least ${MIN_BULLET_CHARS} characters: action, scope, and result.`,
        });
        continue;
      }
      if (text.length > MAX_BULLET_CHARS) {
        add({
          ...ref,
          code: "bullet-too-long",
          severity: "warning",
          message: `Bullet is too long (${text.length} chars).`,
          suggestion: `Tighten to under ${MAX_BULLET_CHARS} characters or split into two bullets.`,
        });
      }
      const weak = WEAK_OPENINGS.find(([pattern]) => pattern.test(text));
      if (weak) {
        add({
          ...ref,
          code: "weak-opening",
          severity: "warning",
          message: `Weak or passive opening: "${text.split(/\s+/).slice(0, 2).join(" ")}".`,
          suggestion: `Start with a strong action verb such as ${weak[1]}.`,
        });
      }
      if (!METRIC.test(text)) {
        add({
          ...ref,
          code: "missing-metric",
          severity: "info",
          message: "No measurable outcome.",
          suggestion: "Add a number, percentage, dollar amount, or scale (e.g. latency cut 40%, 2M users).",
        });
      }
    }
  }

  const wordCount = countWords(
    [
      resume.contact.fullName,
      resume.summary,
      ...resume.experience.flatMap((e) => [e.role, e.company, ...e.bullets.map((b) => b.text)]),
      ...resume.projects.flatMap((p) => [p.name, p.description, ...p.technologies, ...p.bullets.map((b) => b.text)]),
      ...resume.skills.flatMap((s) => [s.category, ...s.items]),
    ].join(" "),
  );
  if (wordCount < MIN_WORDS) {
    add({
      code: "word-count-low",
      severity: "warning",
      section: "document",
      message: `Resume is short (${wordCount} words).`,
      suggestion: `Aim for ${MIN_WORDS}-${MAX_WORDS} words with detail on your impact.`,
    });
  } else if (wordCount > MAX_WORDS) {
    add({
      code: "word-count-high",
      severity: "warning",
      section: "document",
      message: `Resume is long (${wordCount} words).`,
      suggestion: `Trim to under ${MAX_WORDS} words; keep the most relevant, recent achievements.`,
    });
  }

  const warning = findings.filter((f) => f.severity === "warning").length;
  return { findings, counts: { warning, info: findings.length - warning, total: findings.length }, bulletsAnalyzed, wordCount };
}
