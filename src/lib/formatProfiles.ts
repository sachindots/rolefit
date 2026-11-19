import { TEMPLATES, type TemplateDefinition } from "../components/preview/templates";
import type { ExperienceItem, PageSize, ResumeData, TemplateId } from "../types/resume";
import { MAX_BULLET_CHARS } from "./atsAudit";

export type FormatProfileId = "harvard" | "london-uk" | "faang";
export type FormatCheckStatus = "pass" | "warn" | "fail";
export type FormatSourceKind = "official" | "convention";

export interface FormatProfileSettings {
  template: TemplateId;
  pageSize: PageSize;
  /** Optional override for templates that declare a multi-column layout. */
  multiColumn?: boolean;
}

export interface FormatProfileMetadata {
  id: FormatProfileId;
  label: string;
  description: string;
  sources: string;
}

export interface FormatCheckItem {
  id: string;
  label: string;
  status: FormatCheckStatus;
  message: string;
  sourceKind: FormatSourceKind;
  source: string;
}

export interface PageEstimate {
  wordCount: number;
  wordsPerPage: number;
  estimatedPages: number;
  exactPages: number;
  isEstimate: true;
}

export interface TemplateTypographyMetrics {
  fontSizePt: number | null;
  marginXIn: number | null;
  marginYIn: number | null;
  isMultiColumn: boolean;
}

export interface FormatCheckResult {
  profileId: FormatProfileId;
  profile: FormatProfileMetadata;
  score: number;
  checks: FormatCheckItem[];
  counts: { pass: number; warn: number; fail: number; total: number };
  pageEstimate: PageEstimate;
  yearsOfExperience: number | null;
  xyzBulletCount: number;
}

export const FORMAT_PROFILES: Record<FormatProfileId, FormatProfileMetadata> = {
  harvard: {
    id: "harvard",
    label: "Harvard",
    description: "Harvard FAS & HSPH career-services resume standards.",
    sources: "Harvard FAS Office of Career Services, Harvard T.H. Chan HSPH Career Services",
  },
  "london-uk": {
    id: "london-uk",
    label: "London UK CV",
    description: "UK academic and finance/tech CV standards (A4, max 2 pages, no protected fields).",
    sources: "Imperial College London, LSE Careers, London Business School",
  },
  faang: {
    id: "faang",
    label: "FAANG",
    description: "High-impact single-column engineering resume standards with quantified bullets.",
    sources: "Google X-Y-Z guidance, public FAANG resume guides",
  },
};

export const FORMAT_PROFILE_LIST: readonly FormatProfileMetadata[] = [
  FORMAT_PROFILES.harvard,
  FORMAT_PROFILES["london-uk"],
  FORMAT_PROFILES.faang,
];

/**
 * Documented words-per-page estimates derived from each template's typography,
 * line-height, and vertical spacing across US Letter (8.5x11in) and A4 (210x297mm, ~4% larger).
 */
export const WORDS_PER_PAGE: Record<TemplateId, Record<PageSize, number>> = {
  "classic-executive": { letter: 450, a4: 470 },
  "modern-minimal": { letter: 425, a4: 440 },
  "technical-compact": { letter: 575, a4: 600 },
};

const PX_TO_PT = 72 / 96;
const REM_TO_IN = 16 / 96;

const TAILWIND_FONT_PX: Record<string, number> = {
  "text-xs": 12,
  "text-sm": 14,
  "text-base": 16,
  "text-lg": 18,
};

const MULTI_COLUMN_CLASS_RE = /\b(?:(?:sm|md|lg|xl|2xl):)?(?:columns-[2-9]|grid-cols-[2-9])\b/;

const WEAK_OPENINGS = [
  /^responsible for\b/i,
  /^duties (?:included|include)\b/i,
  /^tasked with\b/i,
  /^worked (?:on|with)\b/i,
  /^helped\b/i,
  /^assisted\b/i,
  /^participated in\b/i,
  /^involved in\b/i,
  /^(?:was|were) (?:responsible|involved|part of)\b/i,
  /^(?:contributed to|supported)\b/i,
];

const STRONG_ACTION_VERBS = new Set([
  "accelerated", "achieved", "adapted", "administered", "advanced", "advised", "aligned",
  "analyzed", "architected", "audited", "authored", "automated", "balanced", "boosted",
  "built", "championed", "closed", "coached", "collaborated", "consolidated", "constructed",
  "converted", "coordinated", "created", "cut", "debugged", "decreased", "defined",
  "delivered", "deployed", "designed", "developed", "devised", "diagnosed", "directed",
  "doubled", "drove", "eliminated", "enabled", "engineered", "enhanced", "established",
  "evaluated", "exceeded", "executed", "expanded", "expedited", "facilitated", "formulated",
  "founded", "generated", "grew", "guided", "halved", "headed", "identified", "implemented",
  "improved", "increased", "influenced", "initiated", "innovated", "instituted", "integrated",
  "introduced", "investigated", "launched", "led", "leveraged", "lowered", "maintained",
  "managed", "mentored", "migrated", "minimized", "modeled", "modernized", "monitored",
  "negotiated", "operated", "optimized", "orchestrated", "organized", "overhauled", "owned",
  "partnered", "pioneered", "planned", "presented", "prioritized", "produced", "programmed",
  "proposed", "prototyped", "published", "rebuilt", "recommended", "redesigned", "reduced",
  "refactored", "refined", "remediated", "remodeled", "replaced", "resolved", "restructured",
  "revamped", "reviewed", "rewrote", "saved", "scaled", "scheduled", "secured", "shaped", "shipped",
  "simplified", "solved", "spearheaded", "sped", "standardized", "streamlined", "strengthened",
  "structured", "supervised", "surpassed", "synthesized", "taught", "tested", "trained", "transformed",
  "trimmed", "troubleshot", "unified", "upgraded", "validated", "won", "wrote", "oversaw", "ran",
  // Present-tense equivalents for current roles
  "accelerate", "architect", "automate", "build", "create", "cut", "deliver", "deploy",
  "design", "develop", "drive", "engineer", "improve", "increase", "launch", "lead",
  "manage", "mentor", "migrate", "optimize", "own", "reduce", "scale", "ship", "streamline",
]);

const FIRST_PERSON_RE = /\b(?:i|my|mine|me|myself|we|our|ours|ourselves)\b/i;
const LOWERCASE_US_RE = /\bus\b/;
const METRIC_RE =
  /\d|[%$]|\b(?:(?:thousand|million|billion)s?|dozens?|hundreds?|double[ds]?|tripled|halved)\b/i;
const XYZ_METHOD_RE =
  /\b(?:by|using|via|through|with|leveraging|utilizing|built with|powered by)\s+[a-z0-9]/i;

const IMAGE_OR_GRAPHIC_RE =
  /(?:<img\b|<svg\b|data:image\/|\bhttps?:\/\/\S+\.(?:png|jpe?g|gif|webp|svg)\b|\b(?:headshot|profile photo|portrait photo)\b)/i;

const TABLE_OR_BOX_RE = /(?:<table\b|\|\s*---+\s*\||text\s*box)/i;

const UK_PROTECTED_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:date of birth\b|d\.?o\.?b\.?\s*:|born\s+\d{1,2}\/\d{1,2}\/\d{2,4}\b)/i, "date of birth"],
  [/\b(?:marital status\s*:|status\s*:\s*(?:married|single|divorced)\b)/i, "marital status"],
  [/\b(?:nationality|citizenship)\s*:/i, "nationality"],
  [IMAGE_OR_GRAPHIC_RE, "photo or graphic"],
];

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const PRESENT_RE = /^(?:present|current|now|today|ongoing)$/i;

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function stripBulletMarker(text: string): string {
  return text.trim().replace(/^[\u2022\-*\u2013\u2014]+\s*/, "");
}

function collectAllBullets(resume: ResumeData): string[] {
  return [
    ...resume.experience.flatMap((e) => e.bullets.map((b) => stripBulletMarker(b.text))),
    ...resume.projects.flatMap((p) => p.bullets.map((b) => stripBulletMarker(b.text))),
  ].filter((text) => text.length > 0);
}

function collectResumeText(resume: ResumeData): string {
  return [
    resume.contact.fullName,
    resume.contact.headline,
    resume.contact.email,
    resume.contact.phone,
    resume.contact.location,
    resume.contact.website,
    resume.contact.linkedin,
    resume.contact.github,
    resume.summary,
    ...resume.experience.flatMap((e) => [
      e.company,
      e.role,
      e.location,
      e.startDate,
      e.endDate,
      ...e.bullets.map((b) => b.text),
    ]),
    ...resume.projects.flatMap((p) => [
      p.name,
      p.link,
      p.description,
      ...p.technologies,
      ...p.bullets.map((b) => b.text),
    ]),
    ...resume.skills.flatMap((s) => [s.category, ...s.items]),
    ...resume.education.flatMap((ed) => [
      ed.institution,
      ed.degree,
      ed.location,
      ed.startDate,
      ed.endDate,
      ed.details,
    ]),
  ].join(" ");
}

/**
 * Parses a resume date string into a month index (year * 12 + month).
 * Returns null if unparseable.
 */
export function parseResumeDateMonth(raw: string, now: Date = new Date()): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (PRESENT_RE.test(s)) {
    return now.getFullYear() * 12 + now.getMonth();
  }

  // "Jan 2021", "September 2020", "Jan. 2021"
  const monthYear = /^([A-Za-z]+)\.?\s+(\d{4})$/.exec(s);
  if (monthYear) {
    const month = MONTHS[monthYear[1].toLowerCase()];
    const year = Number.parseInt(monthYear[2], 10);
    if (month !== undefined && year >= 1950 && year <= 2100) {
      return year * 12 + month;
    }
  }

  // "2021-01" or "2021/01"
  const isoMonth = /^(\d{4})[-/](\d{1,2})$/.exec(s);
  if (isoMonth) {
    const year = Number.parseInt(isoMonth[1], 10);
    const month = Number.parseInt(isoMonth[2], 10) - 1;
    if (year >= 1950 && year <= 2100 && month >= 0 && month <= 11) {
      return year * 12 + month;
    }
  }

  // "01/2021" or "1/2021"
  const slashMonth = /^(\d{1,2})\/(\d{4})$/.exec(s);
  if (slashMonth) {
    const month = Number.parseInt(slashMonth[1], 10) - 1;
    const year = Number.parseInt(slashMonth[2], 10);
    if (year >= 1950 && year <= 2100 && month >= 0 && month <= 11) {
      return year * 12 + month;
    }
  }

  // "2021"
  const yearOnly = /^(\d{4})$/.exec(s);
  if (yearOnly) {
    const year = Number.parseInt(yearOnly[1], 10);
    if (year >= 1950 && year <= 2100) {
      return year * 12;
    }
  }

  return null;
}

/**
 * Estimates total years of experience from experience date ranges,
 * merging overlapping intervals so concurrent roles are not double-counted.
 */
export function estimateYearsOfExperience(
  experience: readonly ExperienceItem[],
  now: Date = new Date(),
): number | null {
  const intervals: Array<[number, number]> = [];
  const nowMonth = now.getFullYear() * 12 + now.getMonth();

  for (const item of experience) {
    const start = parseResumeDateMonth(item.startDate, now);
    const end = parseResumeDateMonth(item.endDate, now);
    if (start === null || end === null) continue;
    const clampedEnd = Math.min(end, nowMonth + 12);
    if (clampedEnd < start) continue;
    intervals.push([start, Math.max(start + 1, clampedEnd)]);
  }

  if (intervals.length === 0) return null;

  intervals.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const [start, end] = intervals[i];
    const last = merged[merged.length - 1];
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  const totalMonths = merged.reduce((sum, [start, end]) => sum + (end - start), 0);
  return Math.round((totalMonths / 12) * 10) / 10;
}

export function isReverseChronological(
  experience: readonly ExperienceItem[],
  now: Date = new Date(),
): { ordered: boolean; comparableCount: number } {
  if (experience.length <= 1) {
    return { ordered: true, comparableCount: experience.length };
  }

  const dated: Array<{ end: number; start: number }> = [];
  for (const item of experience) {
    const start = parseResumeDateMonth(item.startDate, now);
    const end = parseResumeDateMonth(item.endDate, now);
    const effectiveEnd = end ?? start;
    const effectiveStart = start ?? end;
    if (effectiveEnd !== null && effectiveStart !== null) {
      dated.push({ end: effectiveEnd, start: effectiveStart });
    }
  }

  if (dated.length < 2) {
    return { ordered: true, comparableCount: dated.length };
  }

  for (let i = 0; i < dated.length - 1; i++) {
    const curr = dated[i];
    const next = dated[i + 1];
    if (curr.end < next.end) {
      return { ordered: false, comparableCount: dated.length };
    }
  }

  return { ordered: true, comparableCount: dated.length };
}

export function estimateResumePages(
  resume: ResumeData,
  settings: Pick<FormatProfileSettings, "template" | "pageSize">,
): PageEstimate {
  const wordsPerPage = WORDS_PER_PAGE[settings.template][settings.pageSize];
  const wordCount = countWords(collectResumeText(resume));
  if (wordCount === 0) {
    return {
      wordCount: 0,
      wordsPerPage,
      estimatedPages: 0,
      exactPages: 0,
      isEstimate: true,
    };
  }
  const exactPages = Math.round((wordCount / wordsPerPage) * 10) / 10;
  const estimatedPages = Math.max(1, Math.ceil(wordCount / wordsPerPage));
  return {
    wordCount,
    wordsPerPage,
    estimatedPages,
    exactPages,
    isEstimate: true,
  };
}

function parseSpacingInches(classes: string, axis: "x" | "y"): number | null {
  // Prefer responsive desktop padding (sm:px-10) over mobile fallback (px-7).
  const re = new RegExp(`(?:^|\\s)(?:sm:)?p${axis}-(\\d+(?:\\.\\d+)?|\\[[\\d.]+(?:in|px|mm|rem)\\])(?=\\s|$)`, "g");
  let selected: number | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(classes)) !== null) {
    const token = match[1];
    if (token.startsWith("[")) {
      const inner = token.slice(1, -1);
      if (inner.endsWith("in")) selected = Number.parseFloat(inner);
      else if (inner.endsWith("px")) selected = Number.parseFloat(inner) / 96;
      else if (inner.endsWith("mm")) selected = Number.parseFloat(inner) / 25.4;
      else if (inner.endsWith("rem")) selected = Number.parseFloat(inner) * REM_TO_IN;
    } else {
      // Tailwind spacing scale: 1 unit = 0.25rem = 4px
      selected = Number.parseFloat(token) * 0.25 * REM_TO_IN;
    }
  }
  return selected !== null && Number.isFinite(selected)
    ? Math.round(selected * 100) / 100
    : null;
}

function parseFontSizePt(classes: string): number | null {
  const arbitrary = /\btext-\[(\d+(?:\.\d+)?)(px|pt)\](?=\s|$)/.exec(classes);
  if (arbitrary) {
    const val = Number.parseFloat(arbitrary[1]);
    const pt = arbitrary[2] === "pt" ? val : val * PX_TO_PT;
    return Math.round(pt * 100) / 100;
  }
  for (const [token, px] of Object.entries(TAILWIND_FONT_PX)) {
    if (new RegExp(`(?:^|\\s)${token}(?=\\s|$)`).test(classes)) {
      return Math.round(px * PX_TO_PT * 100) / 100;
    }
  }
  return null;
}

export function inspectTemplateMetrics(
  templateDef: TemplateDefinition,
  multiColumnOverride?: boolean,
): TemplateTypographyMetrics {
  const sheet = templateDef.styles.sheet;
  const body = templateDef.styles.body;
  const declaredMultiColumn =
    (templateDef as TemplateDefinition & { multiColumn?: boolean }).multiColumn === true;
  const isMultiColumn =
    Boolean(multiColumnOverride) ||
    declaredMultiColumn ||
    MULTI_COLUMN_CLASS_RE.test(sheet) ||
    MULTI_COLUMN_CLASS_RE.test(body);

  return {
    fontSizePt: parseFontSizePt(sheet),
    marginXIn: parseSpacingInches(sheet, "x"),
    marginYIn: parseSpacingInches(sheet, "y"),
    isMultiColumn,
  };
}

function startsWithActionVerb(bullet: string): boolean {
  if (WEAK_OPENINGS.some((re) => re.test(bullet))) return false;
  const firstWord = bullet.split(/\s+/)[0]?.replace(/[^A-Za-z-]/g, "").toLowerCase() ?? "";
  if (!firstWord) return false;
  if (STRONG_ACTION_VERBS.has(firstWord)) return true;
  // Common past-tense verb fallback (e.g. "deployed", "refactored") excluding weak/aux words.
  if (firstWord.length >= 5 && firstWord.endsWith("ed") && !["worked", "helped", "assisted", "tasked", "involved", "participated", "contributed", "supported"].includes(firstWord)) {
    return true;
  }
  return false;
}

function isXyzBullet(bullet: string): boolean {
  return startsWithActionVerb(bullet) && METRIC_RE.test(bullet) && XYZ_METHOD_RE.test(bullet);
}

function hasFirstPerson(text: string): boolean {
  return FIRST_PERSON_RE.test(text) || LOWERCASE_US_RE.test(text);
}

function computeScore(checks: readonly FormatCheckItem[]): number {
  if (checks.length === 0) return 0;
  let points = 0;
  for (const check of checks) {
    if (check.status === "pass") points += 1;
    else if (check.status === "warn") points += 0.5;
  }
  return Math.max(0, Math.min(100, Math.round((points / checks.length) * 100)));
}

function checkHarvard(
  resume: ResumeData,
  settings: FormatProfileSettings,
  pageEstimate: PageEstimate,
  years: number | null,
  now: Date,
): FormatCheckItem[] {
  const checks: FormatCheckItem[] = [];
  const bullets = collectAllBullets(resume);
  const templateDef = TEMPLATES[settings.template];
  const metrics = inspectTemplateMetrics(templateDef, settings.multiColumn);

  // 1. Reverse-chronological experience
  const rev = isReverseChronological(resume.experience, now);
  checks.push({
    id: "harvard-reverse-chronological",
    label: "Reverse-chronological experience",
    status:
      resume.experience.length >= 2 && rev.comparableCount < 2
        ? "warn"
        : rev.ordered
          ? "pass"
          : "fail",
    message:
      resume.experience.length >= 2 && rev.comparableCount < 2
        ? "Add parseable dates to experience roles to verify reverse-chronological order."
        : rev.ordered
          ? "Experience roles are listed in reverse-chronological order."
          : "Experience roles are not in reverse-chronological order; list the most recent role first.",
    sourceKind: "official",
    source: "Harvard FAS Office of Career Services",
  });

  // 2. Education first when under 5 years of experience
  if (years === null) {
    checks.push({
      id: "harvard-education-order",
      label: "Education placement (< 5 yrs experience)",
      status: "warn",
      message:
        "Add experience dates to check whether Education should appear first (advised under 5 years of experience).",
      sourceKind: "official",
      source: "Harvard FAS Office of Career Services",
    });
  } else if (years < 5) {
    checks.push({
      id: "harvard-education-order",
      label: "Education placement (< 5 yrs experience)",
      status: resume.education.length > 0 ? "warn" : "fail",
      message:
        resume.education.length > 0
          ? `Estimated ~${years} yrs experience (< 5 yrs): Harvard advises placing Education above Experience.`
          : `Estimated ~${years} yrs experience (< 5 yrs) and Education is empty; add Education and place it first.`,
      sourceKind: "official",
      source: "Harvard FAS Office of Career Services",
    });
  } else {
    checks.push({
      id: "harvard-education-order",
      label: "Education placement (5+ yrs experience)",
      status: "pass",
      message: `Estimated ~${years} yrs experience (5+ yrs): placing Experience before Education fits Harvard guidance.`,
      sourceKind: "official",
      source: "Harvard FAS Office of Career Services",
    });
  }

  // 3. Action-verb bullets
  if (bullets.length === 0) {
    checks.push({
      id: "harvard-action-verbs",
      label: "Action-verb bullet openings",
      status: "warn",
      message: "Add experience or project bullets starting with strong action verbs.",
      sourceKind: "convention",
      source: "Harvard career-guide consensus",
    });
  } else {
    const actionCount = bullets.filter(startsWithActionVerb).length;
    const ratio = actionCount / bullets.length;
    checks.push({
      id: "harvard-action-verbs",
      label: "Action-verb bullet openings",
      status: ratio >= 0.9 ? "pass" : ratio >= 0.5 ? "warn" : "fail",
      message:
        ratio >= 0.9
          ? `${actionCount}/${bullets.length} bullets open with strong action verbs.`
          : `${bullets.length - actionCount} of ${bullets.length} bullets do not open with a strong action verb.`,
      sourceKind: "convention",
      source: "Harvard career-guide consensus",
    });
  }

  // 4. Avoid first-person pronouns (I, my, we)
  const bulletPronouns = bullets.filter(hasFirstPerson).length;
  const summaryPronoun = hasFirstPerson(resume.summary);
  checks.push({
    id: "harvard-no-first-person",
    label: "No first-person pronouns (I, my, we)",
    status: bulletPronouns > 0 ? "fail" : summaryPronoun ? "warn" : "pass",
    message:
      bulletPronouns > 0
        ? `Found first-person pronouns (I/my/we) in ${bulletPronouns} bullet${bulletPronouns === 1 ? "" : "s"}. Remove them.`
        : summaryPronoun
          ? "Found first-person pronouns in the summary; write in implied first person."
          : "No first-person pronouns detected in bullets or summary.",
    sourceKind: "convention",
    source: "Harvard career-guide consensus",
  });

  // 5. One-line bullets (under 220 chars)
  const longBullets = bullets.filter((b) => b.length >= MAX_BULLET_CHARS).length;
  checks.push({
    id: "harvard-bullet-length",
    label: `Concise bullets (< ${MAX_BULLET_CHARS} chars)`,
    status: longBullets === 0 ? "pass" : longBullets <= 2 ? "warn" : "fail",
    message:
      longBullets === 0
        ? `All bullets stay under ${MAX_BULLET_CHARS} characters.`
        : `${longBullets} bullet${longBullets === 1 ? "" : "s"} reach ${MAX_BULLET_CHARS}+ characters; tighten to keep bullets crisp.`,
    sourceKind: "convention",
    source: "Harvard resume guide consensus",
  });

  // 6. More than 4 bullets per role is a warning
  const crowdedRoles = resume.experience.filter(
    (role) => role.bullets.filter((b) => b.text.trim().length > 0).length > 4,
  );
  checks.push({
    id: "harvard-bullets-per-role",
    label: "At most 4 bullets per role",
    status: crowdedRoles.length === 0 ? "pass" : "warn",
    message:
      crowdedRoles.length === 0
        ? "Every experience role has 4 or fewer bullets."
        : `${crowdedRoles.length} role${crowdedRoles.length === 1 ? "" : "s"} exceed 4 bullets; keep the 3-4 highest-impact points per role.`,
    sourceKind: "convention",
    source: "Harvard career-guide consensus",
  });

  // 7. Font 10-12pt and margins 0.5-1in verified against template styles
  const fontPt = metrics.fontSizePt;
  const marginX = metrics.marginXIn;
  const fontOk = fontPt !== null && fontPt >= 10 && fontPt <= 12;
  const marginOk = marginX !== null && marginX >= 0.5 && marginX <= 1.0;
  const fontClose = fontPt !== null && fontPt >= 9 && fontPt <= 13;
  const marginClose = marginX !== null && marginX >= 0.3 && marginX <= 1.25;
  checks.push({
    id: "harvard-font-margins",
    label: "Font 10–12pt & margins 0.5–1in",
    status: fontOk && marginOk ? "pass" : fontClose && marginClose ? "warn" : "fail",
    message: `${templateDef.label} uses ${fontPt ?? "?"}pt body text and ${marginX ?? "?"}in sheet padding (print @page uses 0.5in Letter / 12mm A4). Harvard specifies 10–12pt font and 0.5–1in margins.`,
    sourceKind: "official",
    source: "Harvard FAS Office of Career Services",
  });

  // 8. No photo or graphics
  const hasGraphics = IMAGE_OR_GRAPHIC_RE.test(collectResumeText(resume));
  checks.push({
    id: "harvard-no-photo-graphics",
    label: "No photo or graphics",
    status: hasGraphics ? "fail" : "pass",
    message: hasGraphics
      ? "Detected a photo, image URL, or graphic reference; remove photos and graphics."
      : "No photos or graphics detected.",
    sourceKind: "convention",
    source: "Harvard career-guide consensus",
  });

  // 9. Name + page-number footer advised when over one page
  checks.push({
    id: "harvard-multipage-footer",
    label: "Multi-page name & page-number footer",
    status: pageEstimate.estimatedPages > 1 ? "warn" : "pass",
    message:
      pageEstimate.estimatedPages > 1
        ? `Estimated ~${pageEstimate.exactPages} pages (${pageEstimate.wordCount} words): add a name + page-number footer when exporting over one page.`
        : `Estimated ${pageEstimate.estimatedPages || 1} page (${pageEstimate.wordCount} words); multi-page footer not required.`,
    sourceKind: "official",
    source: "Harvard T.H. Chan HSPH Career Services",
  });

  // 10. PDF recommended output
  checks.push({
    id: "harvard-pdf-output",
    label: "PDF output format",
    status: "pass",
    message: "Export as PDF (Print to PDF) so formatting stays fixed with selectable text.",
    sourceKind: "official",
    source: "Harvard FAS Office of Career Services",
  });

  return checks;
}

function checkLondonUk(
  resume: ResumeData,
  settings: FormatProfileSettings,
  pageEstimate: PageEstimate,
  years: number | null,
  now: Date,
): FormatCheckItem[] {
  const checks: FormatCheckItem[] = [];
  const fullText = collectResumeText(resume);
  const bullets = collectAllBullets(resume);

  // 1. No photo, DOB, marital status, or nationality
  const foundProtected = UK_PROTECTED_PATTERNS.filter(([re]) => re.test(fullText)).map(
    ([, label]) => label,
  );
  checks.push({
    id: "uk-no-protected-fields",
    label: "No photo, DOB, marital status, or nationality",
    status: foundProtected.length === 0 ? "pass" : "fail",
    message:
      foundProtected.length === 0
        ? "No photo, date of birth, marital status, or nationality fields detected."
        : `Detected restricted UK CV fields: ${foundProtected.join(", ")}. Remove them.`,
    sourceKind: "convention",
    source: "UK CV recruitment consensus",
  });

  // 2. At most 2 pages (1 advised under 5 years)
  let pageStatus: FormatCheckStatus = "pass";
  let pageMessage = `Estimated ${pageEstimate.estimatedPages || 1} page (${pageEstimate.wordCount} words) fits UK CV length guidance.`;
  if (pageEstimate.estimatedPages > 2) {
    pageStatus = "fail";
    pageMessage = `Estimated ~${pageEstimate.exactPages} pages (${pageEstimate.wordCount} words) exceeds the 2-page UK CV maximum.`;
  } else if (pageEstimate.estimatedPages === 2 && years !== null && years < 5) {
    pageStatus = "warn";
    pageMessage = `Estimated ~${pageEstimate.exactPages} pages with ~${years} yrs experience; 1 page is advised under 5 years.`;
  }
  checks.push({
    id: "uk-page-length",
    label: "Page length (max 2 pages; 1 under 5 yrs)",
    status: pageStatus,
    message: pageMessage,
    sourceKind: "official",
    source: "Imperial College London & London Business School",
  });

  // 3. Reverse-chronological
  const rev = isReverseChronological(resume.experience, now);
  checks.push({
    id: "uk-reverse-chronological",
    label: "Reverse-chronological experience",
    status:
      resume.experience.length >= 2 && rev.comparableCount < 2
        ? "warn"
        : rev.ordered
          ? "pass"
          : "fail",
    message:
      resume.experience.length >= 2 && rev.comparableCount < 2
        ? "Add parseable dates to experience roles to verify reverse-chronological order."
        : rev.ordered
          ? "Experience is listed in reverse-chronological order."
          : "Experience is not in reverse-chronological order; place your most recent role first.",
    sourceKind: "official",
    source: "LSE Careers & London Business School",
  });

  // 4. A4 page size (warn on Letter)
  checks.push({
    id: "uk-a4-page-size",
    label: "A4 page size",
    status: settings.pageSize === "a4" ? "pass" : "warn",
    message:
      settings.pageSize === "a4"
        ? "Page size is set to A4 (UK standard)."
        : "Page size is US Letter; switch to A4 for London / UK applications.",
    sourceKind: "convention",
    source: "UK CV format consensus",
  });

  // 5. Achievement-led action-verb bullets
  if (bullets.length === 0) {
    checks.push({
      id: "uk-action-bullets",
      label: "Achievement-led action-verb bullets",
      status: "warn",
      message: "Add achievement-led bullets starting with strong action verbs and measurable results.",
      sourceKind: "official",
      source: "London Business School Career Centre",
    });
  } else {
    const actionCount = bullets.filter(startsWithActionVerb).length;
    const metricCount = bullets.filter((b) => METRIC_RE.test(b)).length;
    const actionRatio = actionCount / bullets.length;
    const metricRatio = metricCount / bullets.length;
    const status: FormatCheckStatus =
      actionRatio >= 0.8 && metricRatio >= 0.4
        ? "pass"
        : actionRatio >= 0.5
          ? "warn"
          : "fail";
    checks.push({
      id: "uk-action-bullets",
      label: "Achievement-led action-verb bullets",
      status,
      message: `${actionCount}/${bullets.length} bullets start with action verbs and ${metricCount}/${bullets.length} include measurable outcomes.`,
      sourceKind: "official",
      source: "London Business School Career Centre",
    });
  }

  return checks;
}

function checkFaang(
  resume: ResumeData,
  settings: FormatProfileSettings,
  pageEstimate: PageEstimate,
  years: number | null,
  xyzCount: number,
): FormatCheckItem[] {
  const checks: FormatCheckItem[] = [];
  const bullets = collectAllBullets(resume);
  const templateDef = TEMPLATES[settings.template];
  const metrics = inspectTemplateMetrics(templateDef, settings.multiColumn);

  // 1. Single-column layout (fails on any multi-column template flag)
  checks.push({
    id: "faang-single-column",
    label: "Single-column ATS layout",
    status: metrics.isMultiColumn ? "fail" : "pass",
    message: metrics.isMultiColumn
      ? `${templateDef.label} is flagged as multi-column; use a single-column layout for ATS parsing.`
      : `${templateDef.label} uses a single-column layout.`,
    sourceKind: "convention",
    source: "Public FAANG & ATS resume guide consensus",
  });

  // 2. One page under 10 years, two pages otherwise
  let pageStatus: FormatCheckStatus = "pass";
  let pageMessage: string;
  if (years !== null && years >= 10) {
    if (pageEstimate.estimatedPages > 2) {
      pageStatus = "fail";
      pageMessage = `Estimated ~${pageEstimate.exactPages} pages (${pageEstimate.wordCount} words) exceeds the 2-page cap for 10+ years of experience (~${years} yrs).`;
    } else {
      pageMessage = `Estimated ${pageEstimate.estimatedPages || 1} page(s) fits the 2-page allowance for ~${years} yrs experience.`;
    }
  } else if (years !== null) {
    if (pageEstimate.estimatedPages > 1) {
      pageStatus = "fail";
      pageMessage = `Estimated ~${pageEstimate.exactPages} pages (${pageEstimate.wordCount} words) with ~${years} yrs experience; keep to 1 page under 10 years.`;
    } else {
      pageMessage = `Estimated 1 page (${pageEstimate.wordCount} words) fits the 1-page target under 10 years (~${years} yrs).`;
    }
  } else {
    if (pageEstimate.estimatedPages > 2) {
      pageStatus = "fail";
      pageMessage = `Estimated ~${pageEstimate.exactPages} pages exceeds FAANG length limits.`;
    } else if (pageEstimate.estimatedPages === 2) {
      pageStatus = "warn";
      pageMessage =
        "Estimated 2 pages; add experience dates to confirm 10+ years (1 page advised under 10 years).";
    } else {
      pageMessage = `Estimated 1 page (${pageEstimate.wordCount} words).`;
    }
  }
  checks.push({
    id: "faang-page-length",
    label: "Page length (1 page < 10 yrs; 2 pages 10+ yrs)",
    status: pageStatus,
    message: pageMessage,
    sourceKind: "convention",
    source: "Public FAANG resume guide consensus",
  });

  // 3. At least 60% of bullets contain a number or measurable outcome
  if (bullets.length === 0) {
    checks.push({
      id: "faang-quantified-bullets",
      label: "At least 60% quantified bullets",
      status: "fail",
      message: "No bullets found; add experience or project bullets with measurable outcomes.",
      sourceKind: "convention",
      source: "Public FAANG resume guide consensus",
    });
  } else {
    const quantified = bullets.filter((b) => METRIC_RE.test(b)).length;
    const pct = Math.round((quantified / bullets.length) * 100);
    checks.push({
      id: "faang-quantified-bullets",
      label: "At least 60% quantified bullets",
      status: pct >= 60 ? "pass" : pct >= 35 ? "warn" : "fail",
      message: `${quantified}/${bullets.length} bullets (${pct}%) include a number or measurable outcome (target: 60%+).`,
      sourceKind: "convention",
      source: "Public FAANG resume guide consensus",
    });
  }

  // 4. XYZ-style bullets reported as a count, not required
  checks.push({
    id: "faang-xyz-bullets",
    label: "Google X-Y-Z bullet count (informational)",
    status: "pass",
    message: `${xyzCount}/${bullets.length} bullets match the X-Y-Z pattern (accomplished X, measured by Y, by doing Z). Reported as a count; not required.`,
    sourceKind: "official",
    source: "Google Careers X-Y-Z guidance",
  });

  // 5. Skills section present
  const hasSkills = resume.skills.some((group) => group.items.some((item) => item.trim().length > 0));
  checks.push({
    id: "faang-skills-section",
    label: "Skills section present",
    status: hasSkills ? "pass" : "fail",
    message: hasSkills
      ? `Skills section lists ${resume.skills.length} group${resume.skills.length === 1 ? "" : "s"}.`
      : "Add a Skills section listing your languages, frameworks, and tools.",
    sourceKind: "convention",
    source: "Public FAANG resume guide consensus",
  });

  // 6. No tables, text boxes, or images
  const fullText = collectResumeText(resume);
  const hasDisallowed = IMAGE_OR_GRAPHIC_RE.test(fullText) || TABLE_OR_BOX_RE.test(fullText);
  checks.push({
    id: "faang-no-tables-images",
    label: "No tables, text boxes, or images",
    status: hasDisallowed ? "fail" : "pass",
    message: hasDisallowed
      ? "Detected table markup, text box reference, or image URL; keep resume plain text."
      : "No tables, text boxes, or images detected.",
    sourceKind: "convention",
    source: "Public FAANG & ATS resume guide consensus",
  });

  return checks;
}

export function checkFormatProfile(
  resume: ResumeData,
  settings: FormatProfileSettings,
  profileId: FormatProfileId,
  now: Date = new Date(),
): FormatCheckResult {
  const pageEstimate = estimateResumePages(resume, settings);
  const yearsOfExperience = estimateYearsOfExperience(resume.experience, now);
  const xyzBulletCount = collectAllBullets(resume).filter(isXyzBullet).length;

  let checks: FormatCheckItem[];
  switch (profileId) {
    case "harvard":
      checks = checkHarvard(resume, settings, pageEstimate, yearsOfExperience, now);
      break;
    case "london-uk":
      checks = checkLondonUk(resume, settings, pageEstimate, yearsOfExperience, now);
      break;
    case "faang":
      checks = checkFaang(resume, settings, pageEstimate, yearsOfExperience, xyzBulletCount);
      break;
  }

  const pass = checks.filter((c) => c.status === "pass").length;
  const warn = checks.filter((c) => c.status === "warn").length;
  const fail = checks.filter((c) => c.status === "fail").length;

  return {
    profileId,
    profile: FORMAT_PROFILES[profileId],
    score: computeScore(checks),
    checks,
    counts: { pass, warn, fail, total: checks.length },
    pageEstimate,
    yearsOfExperience,
    xyzBulletCount,
  };
}
