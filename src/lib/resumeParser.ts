import type { ContactInfo, EducationItem, ExperienceItem, ProjectItem, ResumeData, SkillGroup } from "../types/resume";
import { LIMITS, createEmptyResume, createId, isSafeUrl, validateResume } from "./schema";

export interface ParsedResumeResult {
  resume: ResumeData;
  warnings: string[];
  unmappedLines: string[];
  detectedSections: string[];
}

type SectionKey = "summary" | "experience" | "projects" | "skills" | "education";
interface Line {
  text: string;
  blankBefore: boolean;
}
interface Ctx {
  warnings: string[];
  unmapped: string[];
}

const MAX_INPUT_CHARS = 200_000;
const MAX_UNMAPPED = 100;
const MAX_UNMAPPED_LENGTH = 300;

const SECTION_LABEL: Record<SectionKey, string> = {
  summary: "Summary",
  experience: "Experience",
  projects: "Projects",
  skills: "Skills",
  education: "Education",
};

const HEADINGS: Record<string, SectionKey> = {
  summary: "summary",
  "professional summary": "summary",
  "career summary": "summary",
  profile: "summary",
  "professional profile": "summary",
  objective: "summary",
  "career objective": "summary",
  about: "summary",
  "about me": "summary",
  experience: "experience",
  "work experience": "experience",
  "professional experience": "experience",
  "work history": "experience",
  employment: "experience",
  "employment history": "experience",
  "career history": "experience",
  projects: "projects",
  "personal projects": "projects",
  "selected projects": "projects",
  "open source": "projects",
  skills: "skills",
  "technical skills": "skills",
  "core competencies": "skills",
  technologies: "skills",
  education: "education",
  "academic background": "education",
  qualifications: "education",
};

const OTHER_HEADINGS = new Set([
  "certifications", "certificates", "awards", "honors", "achievements", "languages", "publications", "interests",
  "volunteer", "volunteering", "references", "courses", "activities", "patents", "training", "hobbies",
]);

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const DATE = `(?:${MONTH}\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4}-\\d{1,2}|\\d{4})`;
const END = `(?:${DATE}|present|current|now|today|ongoing)`;
const RANGE = new RegExp(`\\b(${DATE})\\s*(?:-|–|—|to|until)\\s*(${END})\\b`, "i");
const SINGLE_YEAR = /\b(?:19|20)\d{2}\b/g;

const CONTROL = /[\u0000-\u001F\u007F\u00A0\u200B-\u200D\uFEFF]/g;
const RULE = /^[\s\-=_*#~.•|]{3,}$/;
const LONE_MARKER = /^[•▪●◦▫■·*–—-]$/;
const BULLET = /^(?:[•▪●◦▫■·]\s*|[*–—-]\s+)(.+)$/;

const EMAIL = /(?:mailto:)?[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,255}\.[A-Z]{2,24}/i;
const PHONE = /\+?\d[\d\s().-]{6,20}\d/;
const LABEL = /\b(?:e-?mail|phone|tel|telephone|mobile|cell|linkedin|github|website|portfolio|web|address|location)\s*:/gi;
const UNSAFE_SCHEME = /\b(?:javascript|data|vbscript|file):[^\s|]*/gi;
const URL_STRONG = /\b(?:https?:\/\/|www\.|(?:[a-z]{1,30}\.)?(?:linkedin|github)\.com\/?)[^\s|,;<>()]*/gi;
const URL_BARE = /\b[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,5}\.(?:com|io|dev|net|org|me|app|co|ai|tech|xyz)(?:\/[^\s|,;<>()]*)?(?![A-Za-z0-9])/g;

const LOC_STATE = /^[A-Z][A-Za-z.'’-]*(?: [A-Z][A-Za-z.'’-]*){0,3},\s*[A-Z]{2}(?:,\s*[A-Z][A-Za-z ]{1,30})?$/;
const LOC_LOOSE = /^[A-Z][A-Za-z.'’-]*(?: [A-Z][A-Za-z.'’-]*){0,3},\s*[A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)?$/;
const REMOTE = /^(?:remote|hybrid|on-?site)\b/i;
const ROLE_WORDS =
  /\b(?:engineer|developer|manager|lead|architect|director|analyst|designer|scientist|consultant|intern|officer|specialist|administrator|head|vp|president|founder|owner|programmer|technician|associate|coordinator|principal|staff|sde|swe)\b/i;
const INSTITUTION_WORDS = /\b(?:university|college|institute|school|academy|polytechnic|universität|université)\b/i;
const DEGREE_WORDS =
  /\b(?:b\.?s\.?c?|b\.?a|b\.?eng|b\.?tech|m\.?s\.?c?|m\.?a|m\.?eng|m\.?tech|mba|ph\.?d|bachelor|master|doctor|associate|diploma|certificate)\b\.?/i;
const ENTRY_SPLIT = /(\s+[—–-]\s+|\s*\|\s*|\s+(?:at|@)\s+)/i;
const EDU_SPLIT = /(\s+[—–-]\s+|\s*\|\s*)/;

const isLocation = (s: string, loose = false) => LOC_STATE.test(s) || REMOTE.test(s) || (loose && LOC_LOOSE.test(s));
const withTrailingLocation = (parts: string[]) =>
  parts.flatMap((p) => {
    const m = /^(.+?),\s*([A-Z][A-Za-z.'’ -]+,\s*[A-Z]{2})$/.exec(p);
    return m ? [m[1]!, m[2]!] : [p];
  });
const trimSeparators = (s: string) =>
  s.replace(/\(\s*\)/g, " ").replace(/\s+/g, " ").replace(/^[\s|,;:—–-]+|[\s|,;:—–-]+$/g, "");
const joinWith = (a: string, b: string) => (a ? `${a}; ${b}` : b);
const warn = (ctx: Ctx, message: string) => {
  if (!ctx.warnings.includes(message)) ctx.warnings.push(message);
};

function toLines(raw: string): Line[] {
  const out: Line[] = [];
  let blank = false;
  for (const l of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const text = l.replace(CONTROL, " ").replace(/\s+/g, " ").trim();
    if (text === "") {
      blank = true;
    } else if (!RULE.test(text) && !LONE_MARKER.test(text)) {
      out.push({ text, blankBefore: blank });
      blank = false;
    }
  }
  return out;
}

type Heading = { key: SectionKey } | { other: string } | null;

function headingOf(text: string): Heading {
  if (text.length > 40) return null;
  const norm = text.replace(/^[\s:=_*#~|.-]+|[\s:=_*#~|.-]+$/g, "").toLowerCase().replace(/\s+/g, " ");
  const key = HEADINGS[norm];
  if (key) return { key };
  return OTHER_HEADINGS.has(norm) ? { other: text.replace(/[:\s]+$/, "") } : null;
}

function extractRange(text: string): { start: string; end: string; rest: string } | null {
  const m = RANGE.exec(text);
  return m ? { start: m[1]!, end: m[2]!, rest: trimSeparators(text.replace(m[0], " ")) } : null;
}

function extractUrls(text: string): { urls: string[]; rest: string; unsafe: boolean } {
  const urls: string[] = [];
  let unsafe = false;
  const cleaned = text.replace(UNSAFE_SCHEME, () => {
    unsafe = true;
    return " ";
  });
  const take = (pattern: RegExp) => (source: string) =>
    source.replace(pattern, (match) => {
      urls.push(match.replace(/[.,;:!?)]+$/, ""));
      return " ";
    });
  const rest = take(URL_BARE)(take(URL_STRONG)(cleaned));
  return { urls, rest: trimSeparators(rest), unsafe };
}

function normalizeUrl(url: string): string | null {
  const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return isSafeUrl(full) && full.length <= LIMITS.url && !/[<>"'`\s]/.test(full) ? full : null;
}

function parseContact(lines: Line[], ctx: Ctx): ContactInfo {
  const contact = createEmptyResume().contact;
  for (const { text: original } of lines) {
    let text = original.replace(LABEL, " ");
    const email = EMAIL.exec(text);
    if (email) {
      if (!contact.email) contact.email = email[0].replace(/^mailto:/i, "");
      text = text.replace(EMAIL, " ");
    }
    const urlsFound = extractUrls(text);
    if (urlsFound.unsafe) warn(ctx, "An unsafe link in the header was ignored.");
    text = urlsFound.rest;
    const phone = PHONE.exec(text);
    const digits = phone ? phone[0].replace(/\D/g, "").length : 0;
    if (phone && digits >= 7 && digits <= 15 && !/^\d{4}\s*[-–]\s*\d{4}$/.test(phone[0])) {
      if (!contact.phone) contact.phone = phone[0].trim();
      text = text.replace(PHONE, " ");
    }
    for (const url of urlsFound.urls) {
      const safe = normalizeUrl(url);
      if (!safe) {
        warn(ctx, "An unsafe link in the header was ignored.");
        continue;
      }
      const field = /linkedin\.com/i.test(safe) ? "linkedin" : /github\.com/i.test(safe) ? "github" : "website";
      if (contact[field] === "") contact[field] = safe;
      else ctx.unmapped.push(url);
    }
    for (const part of text.split(/\s*[|•·●]\s*/)) {
      const seg = trimSeparators(part);
      if (seg === "") continue;
      if (!contact.fullName && !LOC_STATE.test(seg) && seg.length <= 80) contact.fullName = seg;
      else if (!contact.location && isLocation(seg, true)) contact.location = seg;
      else if (!contact.headline && seg.length <= 100) contact.headline = seg;
      else ctx.unmapped.push(seg);
    }
  }
  return contact;
}

const newExperience = (): ExperienceItem => ({ id: createId(), company: "", role: "", location: "", startDate: "", endDate: "", bullets: [] });

/** Splits "Role | Company", "Role at Company" or "Company — Role" into the entry's empty fields. */
function assignRoleCompany(entry: ExperienceItem, text: string, ctx: Ctx): void {
  if (text === "") return;
  const pieces = text.split(ENTRY_SPLIT);
  const parts = withTrailingLocation(pieces.filter((_, i) => i % 2 === 0).map(trimSeparators).filter((p) => p !== ""));
  const companyFirst = /^\s*[—–-]\s*$/.test(pieces[1] ?? "");
  const unknown: string[] = [];
  for (const part of parts) {
    if (isLocation(part) && !entry.location) entry.location = part;
    else if (ROLE_WORDS.test(part) && !entry.role) entry.role = part;
    else unknown.push(part);
  }
  if (!entry.role && !entry.company && unknown.length >= 2 && companyFirst) {
    entry.company = unknown.shift()!;
    entry.role = unknown.shift()!;
  } else if (!entry.role && !entry.company && unknown.length >= 2) {
    entry.role = unknown.shift()!;
    entry.company = unknown.shift()!;
  }
  for (const part of unknown) {
    if (!entry.company) entry.company = part;
    else if (!entry.role) entry.role = part;
    else ctx.unmapped.push(part);
  }
}

/** True when a non-bullet line extends the previous bullet instead of starting a new entry. */
function continuesBullet(lastBullet: string, text: string, blankBefore: boolean, hasRange: boolean): boolean {
  return !hasRange && !blankBefore && (/^[a-z(]/.test(text) || !/[.;!?:)]$/.test(lastBullet));
}

function parseExperience(lines: Line[], ctx: Ctx): ExperienceItem[] {
  const entries: ExperienceItem[] = [];
  let cur = null as ExperienceItem | null;
  let headerLines = 0;
  const start = () => {
    cur = newExperience();
    entries.push(cur);
    headerLines = 0;
    return cur;
  };
  for (const { text, blankBefore } of lines) {
    const bullet = BULLET.exec(text);
    if (bullet) {
      if (!cur) warn(ctx, "Bullets were found before any role header.");
      (cur ?? start()).bullets.push({ id: createId(), text: bullet[1]! });
      continue;
    }
    const range = extractRange(text);
    const last = cur?.bullets[cur.bullets.length - 1];
    if (cur && last) {
      if (continuesBullet(last.text, text, blankBefore, range !== null)) {
        last.text += ` ${text}`;
        continue;
      }
    }
    const mergeable = cur && cur.bullets.length === 0 && headerLines < 3 && !(range && cur.startDate) && !(blankBefore && headerLines > 0);
    const entry: ExperienceItem = mergeable && cur ? cur : start();
    headerLines += 1;
    if (range && !entry.startDate) {
      entry.startDate = range.start;
      entry.endDate = range.end;
    }
    assignRoleCompany(entry, range ? range.rest : text, ctx);
  }
  return entries;
}

function parseProjects(lines: Line[], ctx: Ctx): ProjectItem[] {
  const projects: ProjectItem[] = [];
  let cur = null as ProjectItem | null;
  const start = () => {
    cur = { id: createId(), name: "", link: "", description: "", technologies: [], bullets: [] };
    projects.push(cur);
    return cur;
  };
  const splitList = (s: string) => s.split(/[,;|•·●]/).map((x) => x.trim()).filter((x) => x !== "");
  for (const { text, blankBefore } of lines) {
    const bullet = BULLET.exec(text);
    if (bullet) {
      (cur ?? start()).bullets.push({ id: createId(), text: bullet[1]! });
      continue;
    }
    const last = cur?.bullets[cur.bullets.length - 1];
    if (cur && last && continuesBullet(last.text, text, blankBefore, false)) {
      last.text += ` ${text}`;
      continue;
    }
    const tech = /^(?:tech(?:nologies)?(?: stack)?|stack|built with|tools)\s*:\s*(.+)$/i.exec(text);
    if (cur && tech) {
      cur.technologies.push(...splitList(tech[1]!));
      continue;
    }
    const { urls, rest, unsafe } = extractUrls(text);
    if (unsafe) warn(ctx, "An unsafe project link was ignored.");
    const isNew = !cur || cur.bullets.length > 0 || blankBefore;
    const project: ProjectItem = isNew || !cur ? start() : cur;
    const link = urls.map(normalizeUrl).find((u): u is string => u !== null);
    if (link && !project.link) project.link = link;
    else if (urls.length > 0 && !link) warn(ctx, "An unsafe project link was ignored.");
    if (rest === "") continue;
    if (isNew) {
      const [name, ...others] = rest.split(/\s+\|\s+|\s+[—–]\s+/);
      project.name = trimSeparators(name ?? "");
      for (const other of others) {
        if (/,/.test(other) || other.split(" ").length <= 3) project.technologies.push(...splitList(other));
        else project.description = joinWith(project.description, other);
      }
    } else {
      project.description = project.description ? `${project.description} ${rest}` : rest;
    }
  }
  return projects;
}

function parseSkills(lines: Line[]): SkillGroup[] {
  const groups: SkillGroup[] = [];
  let fallback: SkillGroup | null = null;
  let last: SkillGroup | null = null;
  let prevEndedWithComma = false;
  const split = (s: string) => s.split(/[,;|•·●]/).map((x) => x.trim()).filter((x) => x !== "");
  const group = (category: string) => {
    const g: SkillGroup = { id: createId(), category, items: [] };
    groups.push(g);
    return g;
  };
  for (const { text } of lines) {
    const body = BULLET.exec(text)?.[1] ?? text;
    const m = /^([^:]{1,40}):\s*(.+)$/.exec(body);
    if (m) {
      last = group(m[1]!.trim());
      last.items.push(...split(m[2]!));
    } else if (prevEndedWithComma && last) {
      last.items.push(...split(body));
    } else {
      fallback ??= group("Skills");
      last = fallback;
      fallback.items.push(...split(body));
    }
    prevEndedWithComma = /,$/.test(body);
  }
  return groups.filter((g) => g.items.length > 0);
}

function parseEducation(lines: Line[]): EducationItem[] {
  const entries: EducationItem[] = [];
  let cur = null as EducationItem | null;
  const start = () => {
    cur = { id: createId(), institution: "", degree: "", location: "", startDate: "", endDate: "", details: "" };
    entries.push(cur);
    return cur;
  };
  const kindOf = (p: string) => (isLocation(p) ? "loc" : INSTITUTION_WORDS.test(p) ? "inst" : DEGREE_WORDS.test(p) ? "deg" : "unknown");
  for (const { text, blankBefore } of lines) {
    const bullet = BULLET.exec(text);
    if (bullet) {
      const e: EducationItem = cur ?? start();
      e.details = joinWith(e.details, bullet[1]!);
      continue;
    }
    if (/\bGPA\b/i.test(text) && cur) {
      cur.details = joinWith(cur.details, text);
      continue;
    }
    const range = extractRange(text);
    let rest = range ? range.rest : text;
    let year: string | null = null;
    if (!range) {
      const years = rest.match(SINGLE_YEAR);
      if (years) {
        year = years[years.length - 1]!;
        rest = trimSeparators(rest.replace(year, " "));
      }
    }
    const parts = withTrailingLocation(rest.split(EDU_SPLIT).filter((_, i) => i % 2 === 0).map(trimSeparators).filter((p) => p !== ""));
    const kinds = parts.map(kindOf);
    const hasContent = cur !== null && (cur.institution !== "" || cur.degree !== "");
    const isNew = !cur || (kinds.includes("inst") && cur.institution !== "") || (kinds.includes("deg") && cur.degree !== "") || (blankBefore && hasContent);
    const entry: EducationItem = isNew || !cur ? start() : cur;
    if (range) {
      entry.startDate ||= range.start;
      entry.endDate ||= range.end;
    } else if (year) {
      entry.endDate ||= year;
    }
    parts.forEach((part, i) => {
      const kind = kinds[i];
      if (kind === "loc" && !entry.location) entry.location = part;
      else if (kind === "inst" && !entry.institution) entry.institution = part;
      else if (kind === "deg" && !entry.degree) entry.degree = part;
      else if (!entry.institution) entry.institution = part;
      else if (!entry.degree) entry.degree = part;
      else entry.details = joinWith(entry.details, part);
    });
  }
  return entries;
}

const TAG = /<\/?[a-z!][^>]{0,500}>/gi;

/** Repeats until stable so nested payloads like `<scr<script>ipt>` cannot reassemble. */
function stripTags(value: string): string {
  let current = value;
  for (;;) {
    const next = current.replace(TAG, "");
    if (next === current) return current.replace(/<(?=[a-z/!])/gi, "");
    current = next;
  }
}

function finalize(raw: ResumeData, ctx: Ctx): ResumeData {
  let trimmed = 0;
  const text = (value: string, max: number) => {
    const cleaned = stripTags(value).replace(CONTROL, " ").replace(/\s+/g, " ").trim();
    if (cleaned.length <= max) return cleaned;
    trimmed += 1;
    return cleaned.slice(0, max).trimEnd();
  };
  const url = (value: string) => {
    const cleaned = text(value, LIMITS.url);
    if (cleaned === "" || (isSafeUrl(cleaned) && !/[<>"'`\s]/.test(cleaned))) return cleaned;
    warn(ctx, "An unsafe link was removed.");
    return "";
  };
  const cap = <T,>(items: T[], max: number, label: string): T[] => {
    if (items.length <= max) return items;
    warn(ctx, `Only the first ${max} ${label} were kept.`);
    return items.slice(0, max);
  };
  const tags = (items: string[]) =>
    cap(items.map((i) => text(i, LIMITS.shortText)).filter((i) => i !== ""), LIMITS.tags, "items per list");
  const bullets = (items: { id: string; text: string }[]) =>
    cap(items, LIMITS.bullets, "bullets per entry").map((b) => ({ id: b.id, text: text(b.text, LIMITS.bullet) }));
  const s = (v: string) => text(v, LIMITS.shortText);

  const c = raw.contact;
  const resume: ResumeData = {
    contact: {
      fullName: s(c.fullName), headline: s(c.headline), email: s(c.email), phone: s(c.phone), location: s(c.location),
      website: url(c.website), linkedin: url(c.linkedin), github: url(c.github),
    },
    summary: text(raw.summary, LIMITS.summary),
    experience: cap(raw.experience, LIMITS.experience, "experience entries").map((e) => ({
      id: e.id, company: s(e.company), role: s(e.role), location: s(e.location),
      startDate: s(e.startDate), endDate: s(e.endDate), bullets: bullets(e.bullets),
    })),
    projects: cap(raw.projects, LIMITS.projects, "projects").map((p) => ({
      id: p.id, name: s(p.name), link: url(p.link), description: text(p.description, LIMITS.details),
      technologies: tags(p.technologies), bullets: bullets(p.bullets),
    })),
    skills: cap(raw.skills, LIMITS.skills, "skill groups").map((g) => ({ id: g.id, category: s(g.category), items: tags(g.items) })),
    education: cap(raw.education, LIMITS.education, "education entries").map((e) => ({
      id: e.id, institution: s(e.institution), degree: s(e.degree), location: s(e.location),
      startDate: s(e.startDate), endDate: s(e.endDate), details: text(e.details, LIMITS.details),
    })),
  };
  if (trimmed > 0) warn(ctx, `${trimmed} field(s) were shortened to fit length limits.`);
  return resume;
}

export function parseResumeText(rawText: string): ParsedResumeResult {
  const ctx: Ctx = { warnings: [], unmapped: [] };
  const detected: SectionKey[] = [];
  const empty = (): ParsedResumeResult => ({ resume: createEmptyResume(), warnings: ctx.warnings, unmappedLines: [], detectedSections: [] });

  let input = typeof rawText === "string" ? rawText : "";
  if (input.length > MAX_INPUT_CHARS) {
    input = input.slice(0, MAX_INPUT_CHARS);
    warn(ctx, "The text was very long; only the first 200,000 characters were read.");
  }
  const lines = toLines(input);
  if (lines.length === 0) {
    warn(ctx, "No resume text was found.");
    return empty();
  }

  const head: Line[] = [];
  const bySection: Record<SectionKey, Line[]> = { summary: [], experience: [], projects: [], skills: [], education: [] };
  let mode: SectionKey | "head" | "other" = "head";
  for (const line of lines) {
    const heading = headingOf(line.text);
    if (heading && "key" in heading) {
      if (!detected.includes(heading.key)) detected.push(heading.key);
      mode = heading.key;
    } else if (heading) {
      warn(ctx, `Unrecognized section "${heading.other}" was not imported.`);
      mode = "other";
      ctx.unmapped.push(line.text);
    } else if (mode === "other") {
      ctx.unmapped.push(line.text);
    } else {
      (mode === "head" ? head : bySection[mode]).push(line);
    }
  }

  const contact = parseContact(head, ctx);
  const raw: ResumeData = {
    contact,
    summary: bySection.summary.map((l) => l.text).join(" "),
    experience: parseExperience(bySection.experience, ctx),
    projects: parseProjects(bySection.projects, ctx),
    skills: parseSkills(bySection.skills),
    education: parseEducation(bySection.education),
  };

  if (detected.length === 0) warn(ctx, "No section headings were found; only contact details were extracted.");
  for (const key of ["experience", "skills", "education"] as const) {
    if (!detected.includes(key)) warn(ctx, `No ${SECTION_LABEL[key]} section was detected.`);
  }
  if (!contact.fullName) warn(ctx, "A name could not be detected.");
  if (!contact.email) warn(ctx, "No email address was found.");

  let resume = finalize(raw, ctx);
  const check = validateResume(resume);
  if (!check.ok) {
    warn(ctx, "The resume could not be parsed reliably; nothing was imported.");
    ctx.unmapped.push(...lines.map((l) => l.text));
    resume = createEmptyResume();
  }
  const unmappedLines = ctx.unmapped
    .map((l) => l.slice(0, MAX_UNMAPPED_LENGTH))
    .filter((l) => l.trim() !== "")
    .slice(0, MAX_UNMAPPED);
  return { resume, warnings: ctx.warnings, unmappedLines, detectedSections: detected.map((k) => SECTION_LABEL[k]) };
}
