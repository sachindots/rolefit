import type { ResumeData } from "../types/resume";
import { auditResume, MAX_BULLET_CHARS, MAX_WORDS, MIN_BULLET_CHARS, MIN_WORDS } from "./atsAudit";
import { analyzeJobDescription } from "./jdEngine";

/**
 * Deterministic client-side ATS readiness score (0-100) with a 5-part breakdown.
 *
 * Fixed base weights (total 100):
 * - Parse readiness: 25 (contact name, email, phone, location present and parseable)
 * - Section structure: 20 (Experience, Education, Skills headings present; dates parse)
 * - Keyword match: 25 (JD keyword coverage via jdEngine when a JD is provided;
 *   when no JD is provided, this 25-point share is redistributed proportionally
 *   across the other four categories to 33 / 27 / 27 / 13)
 * - Bullet quality: 20 (reuses atsAudit findings for action-verb openings, metrics,
 *   and 30-220 character length)
 * - Length and density: 10 (150-900 words target range)
 *
 * Note: Public ATS checkers use similar parse, structure, and keyword models,
 * while real employer ATS weights vary by vendor/configuration and are not published.
 */

export type AtsBreakdownId =
  | "parse-readiness"
  | "section-structure"
  | "keyword-match"
  | "bullet-quality"
  | "length-density";

export interface AtsBreakdownLine {
  id: AtsBreakdownId;
  label: string;
  score: number;
  max: number;
  baseMax: number;
  reason: string;
}

export interface AtsScoreOptions {
  jobDescription?: string;
}

export interface AtsScore {
  total: number;
  breakdown: AtsBreakdownLine[];
  hasJobDescription: boolean;
}

export const ATS_BASE_WEIGHTS: Readonly<Record<AtsBreakdownId, number>> = {
  "parse-readiness": 25,
  "section-structure": 20,
  "keyword-match": 25,
  "bullet-quality": 20,
  "length-density": 10,
};

const EMAIL_RE = /^(?:mailto:)?[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,255}\.[A-Z]{2,24}$/i;
const PHONE_CHARS_RE = /^[+\d\s().extEXT-]+$/;
const YEAR_RANGE_ONLY_RE = /^(?:19|20)\d{2}\s*[-–—]\s*(?:19|20)\d{2}$/;
const NAME_RE = /^[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F\s.'’-]{1,99}$/;
const TWO_LETTERS_RE = /(?:[A-Za-z\u00C0-\u024F].*){2,}/;
const URL_OR_EMAIL_RE = /@|https?:\/\/|www\./i;

const MONTH_OR_SEASON =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|spring|summer|fall|autumn|winter|q[1-4])\\.?,?";
const SINGLE_DATE_RE = new RegExp(
  `^(?:expected\\s+)?(?:(?:19|20)\\d{2}|(?:19|20)\\d{2}[-/](?:0?[1-9]|1[0-2])(?:[-/](?:0?[1-9]|[12]\\d|3[01]))?|(?:0?[1-9]|1[0-2])[-/](?:19|20)\\d{2}|${MONTH_OR_SEASON}\\s+(?:19|20)\\d{2})$`,
  "i",
);
const ONGOING_DATE_RE = /^(?:present|current|now|today|ongoing)$/i;
const RANGE_SPLIT_RE = /\s+(?:-|–|—|to|until)\s+/i;

const asStr = (v: unknown): string => (typeof v === "string" ? v : "");
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asObj = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function coerceResume(input: unknown): ResumeData {
  const root = asObj(input);
  const contact = asObj(root.contact);
  return {
    contact: {
      fullName: asStr(contact.fullName),
      headline: asStr(contact.headline),
      email: asStr(contact.email),
      phone: asStr(contact.phone),
      location: asStr(contact.location),
      website: asStr(contact.website),
      linkedin: asStr(contact.linkedin),
      github: asStr(contact.github),
    },
    summary: asStr(root.summary),
    experience: asArr(root.experience).map((raw, idx) => {
      const e = asObj(raw);
      return {
        id: asStr(e.id) || `exp-${idx}`,
        company: asStr(e.company),
        role: asStr(e.role),
        location: asStr(e.location),
        startDate: asStr(e.startDate),
        endDate: asStr(e.endDate),
        bullets: asArr(e.bullets).map((bRaw, bIdx) => {
          const b = asObj(bRaw);
          return { id: asStr(b.id) || `exp-${idx}-b-${bIdx}`, text: asStr(b.text) };
        }),
      };
    }),
    projects: asArr(root.projects).map((raw, idx) => {
      const p = asObj(raw);
      return {
        id: asStr(p.id) || `proj-${idx}`,
        name: asStr(p.name),
        link: asStr(p.link),
        description: asStr(p.description),
        technologies: asArr(p.technologies).map(asStr),
        bullets: asArr(p.bullets).map((bRaw, bIdx) => {
          const b = asObj(bRaw);
          return { id: asStr(b.id) || `proj-${idx}-b-${bIdx}`, text: asStr(b.text) };
        }),
      };
    }),
    skills: asArr(root.skills).map((raw, idx) => {
      const s = asObj(raw);
      return {
        id: asStr(s.id) || `skill-${idx}`,
        category: asStr(s.category),
        items: asArr(s.items).map(asStr),
      };
    }),
    education: asArr(root.education).map((raw, idx) => {
      const ed = asObj(raw);
      return {
        id: asStr(ed.id) || `edu-${idx}`,
        institution: asStr(ed.institution),
        degree: asStr(ed.degree),
        location: asStr(ed.location),
        startDate: asStr(ed.startDate),
        endDate: asStr(ed.endDate),
        details: asStr(ed.details),
      };
    }),
  };
}

export function isParseableDate(value: string, allowOngoing = false): boolean {
  const trimmed = asStr(value).trim();
  if (!trimmed) return false;
  if (allowOngoing && ONGOING_DATE_RE.test(trimmed)) return true;
  if (SINGLE_DATE_RE.test(trimmed)) return true;
  const parts = trimmed.split(RANGE_SPLIT_RE);
  if (parts.length === 2) {
    return SINGLE_DATE_RE.test(parts[0]!.trim()) && isParseableDate(parts[1]!.trim(), true);
  }
  return false;
}

export function isParseableContactField(
  field: "fullName" | "email" | "phone" | "location",
  value: string,
): boolean {
  const trimmed = asStr(value).trim();
  if (!trimmed) return false;
  switch (field) {
    case "fullName":
      return NAME_RE.test(trimmed) && TWO_LETTERS_RE.test(trimmed) && !URL_OR_EMAIL_RE.test(trimmed);
    case "email":
      return EMAIL_RE.test(trimmed);
    case "phone": {
      if (!PHONE_CHARS_RE.test(trimmed) || YEAR_RANGE_ONLY_RE.test(trimmed)) return false;
      const digits = trimmed.replace(/\D/g, "").length;
      return digits >= 7 && digits <= 15;
    }
    case "location":
      return (
        trimmed.length >= 2 &&
        trimmed.length <= 100 &&
        TWO_LETTERS_RE.test(trimmed) &&
        !URL_OR_EMAIL_RE.test(trimmed)
      );
  }
}

function clampScore(value: number, max: number): number {
  if (!Number.isFinite(value) || max <= 0) return 0;
  return Math.min(max, Math.max(0, Math.round(value)));
}

function scoreParseReadiness(resume: ResumeData, max: number): { score: number; reason: string } {
  const fields: ReadonlyArray<readonly ["fullName" | "email" | "phone" | "location", string]> = [
    ["fullName", "name"],
    ["email", "email"],
    ["phone", "phone"],
    ["location", "location"],
  ];
  const missing: string[] = [];
  const unparseable: string[] = [];
  let earned = 0;

  for (const [key, label] of fields) {
    const raw = resume.contact[key].trim();
    if (!raw) {
      missing.push(label);
    } else if (isParseableContactField(key, raw)) {
      earned += 1;
    } else {
      earned += 0.2;
      unparseable.push(label);
    }
  }

  const score = clampScore((earned / fields.length) * max, max);
  if (missing.length === 0 && unparseable.length === 0) {
    return { score, reason: "Name, email, phone, and location are present and parseable." };
  }
  const parts: string[] = [];
  if (missing.length > 0) parts.push(`Missing ${missing.join(", ")}`);
  if (unparseable.length > 0) parts.push(`unparseable ${unparseable.join(", ")}`);
  return { score, reason: `${parts.join("; ")}.` };
}

function scoreSectionStructure(resume: ResumeData, max: number): { score: number; reason: string } {
  const populatedExp = resume.experience.filter(
    (e) => e.company.trim() || e.role.trim() || e.bullets.some((b) => b.text.trim()),
  );
  const populatedEdu = resume.education.filter(
    (e) => e.institution.trim() || e.degree.trim() || e.details.trim(),
  );
  const hasSkills = resume.skills.some((g) => g.items.some((item) => item.trim().length > 0));

  const expComplete = populatedExp.some((e) => e.company.trim() && e.role.trim());
  const eduComplete = populatedEdu.some((e) => e.institution.trim() && e.degree.trim());

  const expPoints = expComplete ? 5 : populatedExp.length > 0 ? 2.5 : 0;
  const eduPoints = eduComplete ? 5 : populatedEdu.length > 0 ? 2.5 : 0;
  const skillPoints = hasSkills ? 5 : 0;

  let datedEntries = 0;
  let validDatedEntries = 0;

  for (const e of populatedExp) {
    datedEntries += 1;
    const startOk = isParseableDate(e.startDate, false);
    const endOk = isParseableDate(e.endDate, true);
    if ((startOk && endOk) || (startOk && !e.endDate.trim() && RANGE_SPLIT_RE.test(e.startDate))) {
      validDatedEntries += 1;
    } else if ((startOk && !e.endDate.trim()) || (endOk && !e.startDate.trim())) {
      validDatedEntries += 0.5;
    }
  }

  for (const ed of populatedEdu) {
    datedEntries += 1;
    const startTrim = ed.startDate.trim();
    const endTrim = ed.endDate.trim();
    const startOk = isParseableDate(startTrim, false);
    const endOk = isParseableDate(endTrim, true);
    if ((startOk && endOk) || (!startTrim && endOk) || (startOk && !endTrim)) {
      validDatedEntries += 1;
    }
  }

  const dateRatio = datedEntries > 0 ? validDatedEntries / datedEntries : 0;
  const datePoints = 5 * dateRatio;
  const rawTotal = expPoints + eduPoints + skillPoints + datePoints;
  const score = clampScore((rawTotal / 20) * max, max);

  const missingSections: string[] = [];
  if (populatedExp.length === 0) missingSections.push("Experience");
  if (populatedEdu.length === 0) missingSections.push("Education");
  if (!hasSkills) missingSections.push("Skills");

  const issues: string[] = [];
  if (missingSections.length > 0) {
    issues.push(`Missing ${missingSections.join(", ")} section${missingSections.length > 1 ? "s" : ""}`);
  } else {
    if (!expComplete) issues.push("Experience entry is missing a role or company");
    if (!eduComplete) issues.push("Education entry is missing an institution or degree");
  }

  if (datedEntries === 0) {
    issues.push("no dated entries to parse");
  } else if (validDatedEntries < datedEntries) {
    issues.push("some experience or education dates are missing or unparseable");
  }

  if (issues.length === 0) {
    return { score, reason: "Experience, Education, and Skills are present with parseable dates." };
  }
  const sentence = issues.join("; ");
  return { score, reason: `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.` };
}

function scoreBulletQuality(
  audit: ReturnType<typeof auditResume>,
  max: number,
): { score: number; reason: string } {
  const total = audit.bulletsAnalyzed;
  if (total === 0) {
    return { score: 0, reason: "No experience or project bullets to evaluate." };
  }

  const shortCount = audit.findings.filter((f) => f.code === "bullet-too-short").length;
  const longCount = audit.findings.filter((f) => f.code === "bullet-too-long").length;
  const weakCount = audit.findings.filter((f) => f.code === "weak-opening").length;
  const missingMetricCount = audit.findings.filter((f) => f.code === "missing-metric").length;

  const inLengthCount = Math.max(0, total - shortCount - longCount);
  const strongVerbCount = Math.max(0, total - shortCount - weakCount);
  const metricCount = Math.max(0, total - shortCount - missingMetricCount);

  const ratio = (inLengthCount / total + strongVerbCount / total + metricCount / total) / 3;
  const score = clampScore(ratio * max, max);

  if (inLengthCount === total && strongVerbCount === total && metricCount === total) {
    return {
      score,
      reason: `All ${total} bullet${total === 1 ? "" : "s"} use strong action verbs, include metrics, and stay within ${MIN_BULLET_CHARS}-${MAX_BULLET_CHARS} chars.`,
    };
  }

  return {
    score,
    reason: `${strongVerbCount}/${total} start with strong action verbs, ${metricCount}/${total} include metrics, ${inLengthCount}/${total} are ${MIN_BULLET_CHARS}-${MAX_BULLET_CHARS} chars.`,
  };
}

function scoreLengthAndDensity(wordCount: number, max: number): { score: number; reason: string } {
  if (wordCount <= 0) {
    return { score: 0, reason: `Resume is empty (0 words; target ${MIN_WORDS}-${MAX_WORDS} words).` };
  }
  if (wordCount >= MIN_WORDS && wordCount <= MAX_WORDS) {
    return {
      score: max,
      reason: `Word count (${wordCount} words) is within the ${MIN_WORDS}-${MAX_WORDS} word target range.`,
    };
  }
  if (wordCount < MIN_WORDS) {
    const ratio = (wordCount / MIN_WORDS) * 0.7;
    return {
      score: clampScore(ratio * max, max),
      reason: `Resume is short (${wordCount} words; aim for ${MIN_WORDS}-${MAX_WORDS} words).`,
    };
  }
  const ratio = Math.max(0.1, 0.7 * (1 - (wordCount - MAX_WORDS) / MAX_WORDS));
  return {
    score: clampScore(ratio * max, max),
    reason: `Resume is long (${wordCount} words; trim to ${MIN_WORDS}-${MAX_WORDS} words).`,
  };
}

export function scoreResumeForAts(resume: ResumeData, opts?: AtsScoreOptions): AtsScore {
  const safeResume = coerceResume(resume);
  const jdText = typeof opts?.jobDescription === "string" ? opts.jobDescription.trim() : "";
  const hasJobDescription = jdText.length > 0;

  const nonJdBaseTotal =
    ATS_BASE_WEIGHTS["parse-readiness"] +
    ATS_BASE_WEIGHTS["section-structure"] +
    ATS_BASE_WEIGHTS["bullet-quality"] +
    ATS_BASE_WEIGHTS["length-density"];

  const weightFor = (id: AtsBreakdownId): number => {
    const base = ATS_BASE_WEIGHTS[id];
    if (hasJobDescription) return base;
    if (id === "keyword-match") return 0;
    return Math.round((base * 100) / nonJdBaseTotal);
  };

  const audit = auditResume(safeResume);

  const parseMax = weightFor("parse-readiness");
  const parseRes = scoreParseReadiness(safeResume, parseMax);

  const structureMax = weightFor("section-structure");
  const structureRes = scoreSectionStructure(safeResume, structureMax);

  const keywordMax = weightFor("keyword-match");
  let keywordScore = 0;
  let keywordReason = "No job description provided; 25 pts redistributed proportionally across other categories.";
  if (hasJobDescription) {
    const match = analyzeJobDescription(safeResume, jdText);
    if (match.totalKeywords === 0) {
      keywordScore = 0;
      keywordReason = "No extractable technical keywords found in the job description.";
    } else {
      keywordScore = clampScore((match.matched.length / match.totalKeywords) * keywordMax, keywordMax);
      keywordReason = `Matched ${match.matched.length} of ${match.totalKeywords} job description keywords (${match.score}%).`;
    }
  }

  const bulletMax = weightFor("bullet-quality");
  const bulletRes = scoreBulletQuality(audit, bulletMax);

  const lengthMax = weightFor("length-density");
  const lengthRes = scoreLengthAndDensity(audit.wordCount, lengthMax);

  const breakdown: AtsBreakdownLine[] = [
    {
      id: "parse-readiness",
      label: "Parse readiness",
      score: parseRes.score,
      max: parseMax,
      baseMax: ATS_BASE_WEIGHTS["parse-readiness"],
      reason: parseRes.reason,
    },
    {
      id: "section-structure",
      label: "Section structure",
      score: structureRes.score,
      max: structureMax,
      baseMax: ATS_BASE_WEIGHTS["section-structure"],
      reason: structureRes.reason,
    },
    {
      id: "keyword-match",
      label: "Keyword match",
      score: keywordScore,
      max: keywordMax,
      baseMax: ATS_BASE_WEIGHTS["keyword-match"],
      reason: keywordReason,
    },
    {
      id: "bullet-quality",
      label: "Bullet quality",
      score: bulletRes.score,
      max: bulletMax,
      baseMax: ATS_BASE_WEIGHTS["bullet-quality"],
      reason: bulletRes.reason,
    },
    {
      id: "length-density",
      label: "Length and density",
      score: lengthRes.score,
      max: lengthMax,
      baseMax: ATS_BASE_WEIGHTS["length-density"],
      reason: lengthRes.reason,
    },
  ];

  const total = clampScore(
    breakdown.reduce((sum, line) => sum + line.score, 0),
    100,
  );

  return {
    total,
    breakdown,
    hasJobDescription,
  };
}
