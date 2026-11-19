export interface AuditableResume {
  contact: { fullName: string; email: string; phone: string; location: string };
  summary: string;
  experience: ReadonlyArray<{
    id: string;
    company: string;
    role: string;
    bullets: ReadonlyArray<{ id: string; text: string }>;
  }>;
  projects: ReadonlyArray<{
    id: string;
    name: string;
    description: string;
    technologies: readonly string[];
    bullets: ReadonlyArray<{ id: string; text: string }>;
  }>;
  skills: ReadonlyArray<{ category: string; items: readonly string[] }>;
}

export interface KeywordChip {
  keyword: string;
  count: number;
}

export interface JdMatchResult {
  score: number;
  matched: KeywordChip[];
  missing: KeywordChip[];
  totalKeywords: number;
}

const ALIAS_GROUPS: readonly (readonly string[])[] = [
  ["Node.js", "nodejs", "node.js"],
  ["CI/CD", "cicd", "ci/cd", "ci-cd"],
  ["Kubernetes", "k8s", "kubernetes"],
  ["TypeScript", "ts", "typescript"],
  ["JavaScript", "js", "javascript", "ecmascript"],
  ["PostgreSQL", "postgres", "postgresql"],
  ["React", "react", "reactjs", "react.js"],
  ["Vue.js", "vue", "vuejs", "vue.js"],
  ["Next.js", "nextjs", "next.js"],
  ["C++", "c++", "cpp"],
  ["C#", "c#", "csharp"],
  [".NET", ".net", "dotnet"],
  ["Golang", "golang"],
  ["AWS", "aws", "amazon web services"],
  ["GCP", "gcp", "google cloud"],
  ["MongoDB", "mongo", "mongodb"],
  ["machine learning", "ml"],
];

const ALIASES = new Map<string, string>();
const CANONICAL_DISPLAY = new Map<string, string>();
for (const [display, ...variants] of ALIAS_GROUPS) {
  const key = display.toLowerCase();
  CANONICAL_DISPLAY.set(key, display);
  for (const variant of variants) ALIASES.set(variant, key);
}

const STOPWORDS = new Set(
  (
    "a an and are as at be been being but by can could do does for from had has have he her his i if in into is it its " +
    "me my no not of on or our out over she so than that the their them then there these they this those to up us was we were " +
    "what when where which while who whom why will with within would you your yours also about above across after again all am " +
    "any because before below between both during each few further how more most other same should some such too under until " +
    "very via per etc e.g i.e and/or including include includes using use used"
  ).split(" "),
);

const FLUFF = new Set(
  (
    "ability able team teams work works working worked experience experiences year years strong excellent good great " +
    "looking join company role position candidate candidates opportunity responsibilities responsibility requirements " +
    "required preferred plus skills skill knowledge understanding must need needs seeking ideal passionate motivated " +
    "environment fast paced world class leading successful proven track record communication collaborate collaborative " +
    "related field degree bachelor bachelors master masters equivalent benefits salary apply description job"
  ).split(" "),
);

const TECH_TERMS = new Set(
  (
    "javascript typescript python java ruby rust php swift kotlin scala sql nosql html css sass react angular vue svelte " +
    "redux graphql rest grpc docker kubernetes terraform ansible jenkins git github gitlab linux unix bash aws azure gcp " +
    "redis kafka rabbitmq mongodb postgresql mysql sqlite elasticsearch spark hadoop airflow pandas numpy tensorflow pytorch " +
    "jest vitest cypress playwright selenium webpack vite babel tailwind figma storybook oauth jwt microservices serverless " +
    "agile scrum jira devops sre api apis sdk saas ios android flutter django flask rails spring express nestjs fastapi " +
    "prometheus grafana datadog nginx lambda s3 ec2 etl llm nlp"
  ).split(" "),
);

const CURATED_PHRASES = new Set(([
  "distributed systems",
  "design systems",
  "design system",
  "machine learning",
  "deep learning",
  "natural language processing",
  "computer vision",
  "data structures",
  "data pipelines",
  "data engineering",
  "data science",
  "data analysis",
  "data modeling",
  "system design",
  "object oriented",
  "unit testing",
  "integration testing",
  "test automation",
  "version control",
  "cloud computing",
  "web development",
  "full stack",
  "front end",
  "back end",
  "responsive design",
  "user experience",
  "user interface",
  "continuous integration",
  "continuous delivery",
  "continuous deployment",
  "infrastructure as code",
  "event driven",
  "load balancing",
  "performance optimization",
  "code review",
  "technical leadership",
  "product management",
  "project management",
  "rest api",
  "rest apis",
  "web services",
  "big data",
  "software architecture",
  "software development",
  "ci/cd",
  "tcp/ip",
  "ui/ux",
] as const).map((phrase) => phrase.split(" ").map(normalizeToken).join(" ")));

const SYMBOL_TOKEN = /[+#]|\.[a-z]|\/|\d/i;
const HAS_LETTER = /[a-z]/;

function cleanChunk(chunk: string): string {
  let s = chunk.replace(/^[/_]+/, "");
  if (!/^\.[A-Za-z]/.test(s)) s = s.replace(/^\.+/, "");
  s = s.replace(/[./_]+$/, "");
  s = s.replace(/(?<!\+)\+$/, "");
  return /[A-Za-z0-9]/.test(s) ? s : "";
}

function normalizeToken(raw: string): string {
  const lower = raw.toLowerCase();
  const aliased = ALIASES.get(lower);
  if (aliased) return aliased;
  if (lower.length > 4 && lower.endsWith("s") && !lower.endsWith("ss") && !/[+#./\d]/.test(lower)) {
    return lower.slice(0, -1);
  }
  return lower;
}

interface Token {
  norm: string;
  surface: string;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(/[A-Za-z0-9+#./_]+/g)) {
    const cleaned = cleanChunk(match[0]);
    if (!cleaned) continue;
    const norm = normalizeToken(cleaned);
    tokens.push({ norm, surface: SYMBOL_TOKEN.test(cleaned) ? cleaned : cleaned.toLowerCase() });
    if (cleaned.includes("/") && !CANONICAL_DISPLAY.has(norm)) {
      for (const part of cleaned.split("/")) {
        const cleanedPart = cleanChunk(part);
        if (cleanedPart) tokens.push({ norm: normalizeToken(cleanedPart), surface: cleanedPart.toLowerCase() });
      }
    }
  }
  return tokens;
}

export function tokenizeTechnicalText(text: string): string[] {
  return tokenize(text).map((t) => t.norm);
}

function isNoise(token: string): boolean {
  return STOPWORDS.has(token) || FLUFF.has(token);
}

function isSymbolKeyword(token: string): boolean {
  if (!SYMBOL_TOKEN.test(token) || !HAS_LETTER.test(token)) return false;
  return !token.split("/").some((part) => STOPWORDS.has(part));
}

interface Keyword {
  count: number;
  display: string;
}

function addCount(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function extractKeywords(tokens: readonly Token[]): Map<string, Keyword> {
  const norms = tokens.map((t) => t.norm);
  const keywords = new Map<string, Keyword>();
  const wordFrequency = new Map<string, number>();
  const bigramFrequency = new Map<string, number>();
  const surfaceOf = (from: number, length: number) =>
    tokens.slice(from, from + length).map((t) => t.surface).join(" ");

  const record = (term: string, display: string) => {
    const existing = keywords.get(term);
    if (existing) existing.count++;
    else keywords.set(term, { count: 1, display: CANONICAL_DISPLAY.get(term) ?? display });
  };

  for (let i = 0; i < norms.length; i++) {
    const token = norms[i];
    if (!isNoise(token) && token.length >= 4 && !SYMBOL_TOKEN.test(token)) addCount(wordFrequency, token);
    const next = norms[i + 1];
    if (next !== undefined && next !== token && !isNoise(token) && !isNoise(next) && token.length > 2 && next.length > 2) {
      addCount(bigramFrequency, `${token} ${next}`);
    }
  }

  for (let i = 0; i < norms.length; ) {
    const trigram = norms.slice(i, i + 3).join(" ");
    const bigram = norms.slice(i, i + 2).join(" ");
    if (i + 2 < norms.length && CURATED_PHRASES.has(trigram)) {
      record(trigram, surfaceOf(i, 3));
      i += 3;
    } else if (i + 1 < norms.length && CURATED_PHRASES.has(bigram)) {
      record(bigram, surfaceOf(i, 2));
      i += 2;
    } else {
      const token = norms[i];
      if (CURATED_PHRASES.has(token) || CANONICAL_DISPLAY.has(token) || TECH_TERMS.has(token) || isSymbolKeyword(token)) {
        record(token, surfaceOf(i, 1));
      }
      i += 1;
    }
  }

  const phraseWords = new Set([...keywords.keys()].filter((k) => k.includes(" ")).flatMap((k) => k.split(" ")));
  const frequent = (frequency: Map<string, number>) => {
    for (const [term, count] of frequency) {
      if (count >= 2 && !keywords.has(term) && !phraseWords.has(term)) keywords.set(term, { count, display: term });
    }
  };
  frequent(wordFrequency);
  frequent(bigramFrequency);
  return keywords;
}

function resumeSections(resume: AuditableResume): string[] {
  return [
    resume.summary,
    ...resume.experience.flatMap((e) => [e.role, e.company, ...e.bullets.map((b) => b.text)]),
    ...resume.projects.flatMap((p) => [p.name, p.description, ...p.technologies, ...p.bullets.map((b) => b.text)]),
    ...resume.skills.flatMap((s) => [s.category, ...s.items]),
  ];
}

function buildResumeIndex(resume: AuditableResume): Set<string> {
  const index = new Set<string>();
  for (const section of resumeSections(resume)) {
    const tokens = tokenizeTechnicalText(section);
    for (let i = 0; i < tokens.length; i++) {
      index.add(tokens[i]);
      if (i + 1 < tokens.length) index.add(`${tokens[i]} ${tokens[i + 1]}`);
      if (i + 2 < tokens.length) index.add(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
    }
  }
  return index;
}

function byRelevance(a: KeywordChip, b: KeywordChip): number {
  return b.count - a.count || a.keyword.localeCompare(b.keyword);
}

export function analyzeJobDescription(resume: AuditableResume, jobDescription: string): JdMatchResult {
  const counts = extractKeywords(tokenize(jobDescription));
  if (counts.size === 0) return { score: 0, matched: [], missing: [], totalKeywords: 0 };

  const index = buildResumeIndex(resume);
  const matched: KeywordChip[] = [];
  const missing: KeywordChip[] = [];
  for (const [term, { count, display }] of counts) {
    (index.has(term) ? matched : missing).push({ keyword: display, count });
  }
  matched.sort(byRelevance);
  missing.sort(byRelevance);

  const total = counts.size;
  const score = Math.min(100, Math.max(0, Math.round((matched.length / total) * 100)));
  return { score, matched, missing, totalKeywords: total };
}
