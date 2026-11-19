import type {
  BulletItem,
  ContactInfo,
  EducationItem,
  ExperienceItem,
  PageSize,
  ProjectItem,
  ResumeData,
  SkillGroup,
  TemplateId,
  ThemeMode,
  WorkspaceState,
} from "../types/resume";

export const LIMITS = {
  shortText: 200,
  url: 500,
  summary: 2000,
  bullet: 600,
  details: 1000,
  jobDescription: 20000,
  experience: 30,
  projects: 30,
  skills: 30,
  education: 20,
  bullets: 20,
  tags: 50,
} as const;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const TEMPLATES: readonly TemplateId[] = ["classic-executive", "modern-minimal", "technical-compact"];
const PAGE_SIZES: readonly PageSize[] = ["letter", "a4"];
const THEMES: readonly ThemeMode[] = ["light", "dark"];
const SAFE_PROTOCOLS = new Set(["https:", "http:", "mailto:"]);

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

export function isSafeUrl(value: string): boolean {
  if (value === "") return true;
  if (value !== value.trim()) return false;
  try {
    return SAFE_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

let idCounter = 0;
export function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  idCounter += 1;
  return `id-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function createEmptyResume(): ResumeData {
  return {
    contact: { fullName: "", headline: "", email: "", phone: "", location: "", website: "", linkedin: "", github: "" },
    summary: "",
    experience: [],
    projects: [],
    skills: [],
    education: [],
  };
}

export function createEmptyWorkspace(): WorkspaceState {
  return {
    schemaVersion: 1,
    resume: createEmptyResume(),
    jobDescription: "",
    template: "classic-executive",
    pageSize: "letter",
    theme: "light",
  };
}

export function moveItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < items.length;
  const next = [...items];
  if (!inRange(fromIndex) || !inRange(toIndex) || fromIndex === toIndex) return next;
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved as T);
  return next;
}

/** Collects errors while reading fields; unknown keys are never copied. */
class Reader {
  readonly errors: string[] = [];

  constructor(
    private readonly src: Rec,
    private readonly path: string,
  ) {}

  text(key: string, max: number, opts: { url?: boolean; required?: boolean } = {}): string {
    const v = this.src[key];
    const where = `${this.path}.${key}`;
    if (typeof v !== "string") {
      this.errors.push(`${where} must be a string`);
      return "";
    }
    if (v.length > max) this.errors.push(`${where} exceeds ${max} characters`);
    if (opts.required && v.trim() === "") this.errors.push(`${where} must not be empty`);
    if (opts.url && !isSafeUrl(v)) this.errors.push(`${where} must be an http, https or mailto URL`);
    return v;
  }

  list<T>(key: string, cap: number, parse: (item: unknown, path: string) => ValidationResult<T>): T[] {
    const v = this.src[key];
    const where = `${this.path}.${key}`;
    if (!Array.isArray(v)) {
      this.errors.push(`${where} must be an array`);
      return [];
    }
    if (v.length > cap) {
      this.errors.push(`${where} exceeds ${cap} items`);
      return [];
    }
    const out: T[] = [];
    v.forEach((item, i) => {
      const r = parse(item, `${where}[${i}]`);
      if (r.ok) out.push(r.value);
      else this.errors.push(...r.errors);
    });
    return out;
  }

  strings(key: string, cap: number, max: number): string[] {
    return this.list(key, cap, (item, path) =>
      typeof item === "string" && item.length <= max
        ? { ok: true, value: item }
        : { ok: false, errors: [`${path} must be a string up to ${max} characters`] },
    );
  }
}

function parseRecord<T>(
  input: unknown,
  path: string,
  build: (r: Reader) => T,
): ValidationResult<T> {
  if (!isRecord(input)) return { ok: false, errors: [`${path} must be an object`] };
  const reader = new Reader(input, path);
  const value = build(reader);
  return reader.errors.length > 0 ? { ok: false, errors: reader.errors } : { ok: true, value };
}

const parseBullet = (input: unknown, path: string): ValidationResult<BulletItem> =>
  parseRecord(input, path, (r) => ({
    id: r.text("id", LIMITS.shortText, { required: true }),
    text: r.text("text", LIMITS.bullet),
  }));

const parseContact = (input: unknown, path: string): ValidationResult<ContactInfo> =>
  parseRecord(input, path, (r) => ({
    fullName: r.text("fullName", LIMITS.shortText),
    headline: r.text("headline", LIMITS.shortText),
    email: r.text("email", LIMITS.shortText),
    phone: r.text("phone", LIMITS.shortText),
    location: r.text("location", LIMITS.shortText),
    website: r.text("website", LIMITS.url, { url: true }),
    linkedin: r.text("linkedin", LIMITS.url, { url: true }),
    github: r.text("github", LIMITS.url, { url: true }),
  }));

const parseExperience = (input: unknown, path: string): ValidationResult<ExperienceItem> =>
  parseRecord(input, path, (r) => ({
    id: r.text("id", LIMITS.shortText, { required: true }),
    company: r.text("company", LIMITS.shortText),
    role: r.text("role", LIMITS.shortText),
    location: r.text("location", LIMITS.shortText),
    startDate: r.text("startDate", LIMITS.shortText),
    endDate: r.text("endDate", LIMITS.shortText),
    bullets: r.list("bullets", LIMITS.bullets, parseBullet),
  }));

const parseProject = (input: unknown, path: string): ValidationResult<ProjectItem> =>
  parseRecord(input, path, (r) => ({
    id: r.text("id", LIMITS.shortText, { required: true }),
    name: r.text("name", LIMITS.shortText),
    link: r.text("link", LIMITS.url, { url: true }),
    description: r.text("description", LIMITS.details),
    technologies: r.strings("technologies", LIMITS.tags, LIMITS.shortText),
    bullets: r.list("bullets", LIMITS.bullets, parseBullet),
  }));

const parseSkillGroup = (input: unknown, path: string): ValidationResult<SkillGroup> =>
  parseRecord(input, path, (r) => ({
    id: r.text("id", LIMITS.shortText, { required: true }),
    category: r.text("category", LIMITS.shortText),
    items: r.strings("items", LIMITS.tags, LIMITS.shortText),
  }));

const parseEducation = (input: unknown, path: string): ValidationResult<EducationItem> =>
  parseRecord(input, path, (r) => ({
    id: r.text("id", LIMITS.shortText, { required: true }),
    institution: r.text("institution", LIMITS.shortText),
    degree: r.text("degree", LIMITS.shortText),
    location: r.text("location", LIMITS.shortText),
    startDate: r.text("startDate", LIMITS.shortText),
    endDate: r.text("endDate", LIMITS.shortText),
    details: r.text("details", LIMITS.details),
  }));

function parseResume(input: unknown, path: string): ValidationResult<ResumeData> {
  if (!isRecord(input)) return { ok: false, errors: [`${path} must be an object`] };
  const r = new Reader(input, path);
  const contact = parseContact(input.contact, `${path}.contact`);
  if (!contact.ok) r.errors.push(...contact.errors);
  const value: ResumeData = {
    contact: contact.ok ? contact.value : createEmptyResume().contact,
    summary: r.text("summary", LIMITS.summary),
    experience: r.list("experience", LIMITS.experience, parseExperience),
    projects: r.list("projects", LIMITS.projects, parseProject),
    skills: r.list("skills", LIMITS.skills, parseSkillGroup),
    education: r.list("education", LIMITS.education, parseEducation),
  };
  return r.errors.length > 0 ? { ok: false, errors: r.errors } : { ok: true, value };
}

export const validateResume = (input: unknown): ValidationResult<ResumeData> => parseResume(input, "resume");

export function validateWorkspaceState(input: unknown): ValidationResult<WorkspaceState> {
  if (!isRecord(input)) return { ok: false, errors: ["workspace must be an object"] };
  const errors: string[] = [];
  if (input.schemaVersion !== 1) errors.push("workspace.schemaVersion must be 1");
  const resume = parseResume(input.resume, "workspace.resume");
  if (!resume.ok) errors.push(...resume.errors);
  const r = new Reader(input, "workspace");
  const jobDescription = r.text("jobDescription", LIMITS.jobDescription);
  errors.push(...r.errors);
  const template = TEMPLATES.find((t) => t === input.template);
  const pageSize = PAGE_SIZES.find((p) => p === input.pageSize);
  const theme = THEMES.find((t) => t === input.theme);
  if (!template) errors.push("workspace.template is not a known template");
  if (!pageSize) errors.push("workspace.pageSize must be letter or a4");
  if (!theme) errors.push("workspace.theme must be light or dark");
  if (errors.length > 0 || !resume.ok || !template || !pageSize || !theme) return { ok: false, errors };
  return { ok: true, value: { schemaVersion: 1, resume: resume.value, jobDescription, template, pageSize, theme } };
}
