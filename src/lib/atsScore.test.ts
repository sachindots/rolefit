import { describe, expect, it } from "vitest";
import { createSampleWorkspace, SAMPLE_JOB_DESCRIPTION } from "../data/sampleWorkspace";
import type { ResumeData } from "../types/resume";
import {
  ATS_BASE_WEIGHTS,
  isParseableContactField,
  isParseableDate,
  scoreResumeForAts,
  type AtsBreakdownId,
} from "./atsScore";
import { createEmptyResume } from "./schema";

const STRONG_BULLET =
  "Architected distributed event pipeline in TypeScript and Go, cutting p95 latency by 42% across 12 microservices.";

function getLine(result: ReturnType<typeof scoreResumeForAts>, id: AtsBreakdownId) {
  const found = result.breakdown.find((line) => line.id === id);
  if (!found) throw new Error(`Missing breakdown line: ${id}`);
  return found;
}

function makeIdealResume(): ResumeData {
  const words = Array.from({ length: 35 }, (_, i) => `delivered scalable platform service module ${i + 1}`).join(" ");
  return {
    contact: {
      fullName: "Ada Lovelace",
      headline: "Principal Systems Engineer",
      email: "ada.lovelace@example.com",
      phone: "+1 (555) 019-2834",
      location: "London, UK",
      website: "https://adalovelace.example.com",
      linkedin: "https://linkedin.com/in/adalovelace",
      github: "https://github.com/adalovelace",
    },
    summary: `Principal software engineer with 10 years of experience designing distributed systems, design systems, TypeScript, React, Node.js, PostgreSQL, C++, and CI/CD pipelines. ${words}.`,
    experience: [
      {
        id: "exp-1",
        company: "Analytical Engines Ltd",
        role: "Staff Software Engineer",
        location: "London, UK",
        startDate: "2021-02",
        endDate: "Present",
        bullets: [
          {
            id: "b-1",
            text: "Led 8 engineers building TypeScript, React, and Node.js services handling 4M requests daily with 99.99% uptime.",
          },
          {
            id: "b-2",
            text: "Optimized PostgreSQL query plans and C++ native extensions, reducing p99 latency by 48% across distributed systems.",
          },
          {
            id: "b-3",
            text: "Automated CI/CD deployment pipelines and design systems release checks, cutting lead time from 60 minutes to 8 minutes.",
          },
        ],
      },
    ],
    projects: [
      {
        id: "proj-1",
        name: "Babbage Trace",
        link: "https://github.com/adalovelace/babbage-trace",
        description: "High-throughput telemetry collector for distributed systems.",
        technologies: ["TypeScript", "Node.js", "PostgreSQL", "C++", "React"],
        bullets: [
          {
            id: "pb-1",
            text: "Shipped open-source observability agent adopted by 1,200 teams, cutting memory overhead by 35%.",
          },
        ],
      },
    ],
    skills: [
      {
        id: "sk-1",
        category: "Core Stack",
        items: ["TypeScript", "React", "Node.js", "PostgreSQL", "C++", "CI/CD", "distributed systems", "design systems"],
      },
    ],
    education: [
      {
        id: "edu-1",
        institution: "University of London",
        degree: "M.S. Computer Science",
        location: "London, UK",
        startDate: "2013",
        endDate: "2017",
        details: "First Class Honours.",
      },
    ],
  };
}

describe("scoreResumeForAts core requirements (S1, S2)", () => {
  it("scores an empty resume at 0 (well below 20) both with and without a JD", () => {
    const empty = createEmptyResume();
    const withoutJd = scoreResumeForAts(empty);
    const withJd = scoreResumeForAts(empty, { jobDescription: SAMPLE_JOB_DESCRIPTION });

    expect(withoutJd.total).toBe(0);
    expect(withoutJd.total).toBeLessThan(20);
    expect(withoutJd.hasJobDescription).toBe(false);

    expect(withJd.total).toBe(0);
    expect(withJd.total).toBeLessThan(20);
    expect(withJd.hasJobDescription).toBe(true);
  });

  it("keeps a sparse contact-only resume below 20", () => {
    const sparse = createEmptyResume();
    sparse.contact.fullName = "Ada Lovelace";
    const result = scoreResumeForAts(sparse);
    expect(result.total).toBeLessThan(20);
  });

  it("returns the 5-part breakdown with fixed base weights when a JD is provided", () => {
    const resume = makeIdealResume();
    const result = scoreResumeForAts(resume, { jobDescription: SAMPLE_JOB_DESCRIPTION });

    expect(result.hasJobDescription).toBe(true);
    expect(result.breakdown.map((b) => ({ id: b.id, max: b.max, baseMax: b.baseMax }))).toEqual([
      { id: "parse-readiness", max: 25, baseMax: 25 },
      { id: "section-structure", max: 20, baseMax: 20 },
      { id: "keyword-match", max: 25, baseMax: 25 },
      { id: "bullet-quality", max: 20, baseMax: 20 },
      { id: "length-density", max: 10, baseMax: 10 },
    ]);
    expect(result.total).toBe(100);
    for (const line of result.breakdown) {
      expect(line.score).toBe(line.max);
      expect(line.reason.length).toBeGreaterThan(10);
    }
  });

  it("redistributes keyword-match weight proportionally (33/27/0/27/13 = 100) when JD is absent or blank", () => {
    const resume = makeIdealResume();
    for (const opts of [undefined, {}, { jobDescription: "" }, { jobDescription: "   \n\t " }]) {
      const result = scoreResumeForAts(resume, opts);
      expect(result.hasJobDescription).toBe(false);
      expect(result.breakdown.map((b) => ({ id: b.id, max: b.max, baseMax: b.baseMax }))).toEqual([
        { id: "parse-readiness", max: 33, baseMax: ATS_BASE_WEIGHTS["parse-readiness"] },
        { id: "section-structure", max: 27, baseMax: ATS_BASE_WEIGHTS["section-structure"] },
        { id: "keyword-match", max: 0, baseMax: ATS_BASE_WEIGHTS["keyword-match"] },
        { id: "bullet-quality", max: 27, baseMax: ATS_BASE_WEIGHTS["bullet-quality"] },
        { id: "length-density", max: 13, baseMax: ATS_BASE_WEIGHTS["length-density"] },
      ]);
      expect(result.breakdown.reduce((s, b) => s + b.max, 0)).toBe(100);
      expect(getLine(result, "keyword-match").score).toBe(0);
      expect(getLine(result, "keyword-match").reason).toMatch(/redistributed/i);
      expect(result.total).toBe(100);
    }
  });

  it("scores the sample workspace realistically and deterministically", () => {
    const sample = createSampleWorkspace();
    const first = scoreResumeForAts(sample.resume, { jobDescription: sample.jobDescription });
    const second = scoreResumeForAts(sample.resume, { jobDescription: sample.jobDescription });

    expect(first).toEqual(second);
    expect(first.total).toBeGreaterThanOrEqual(85);
    expect(first.total).toBeLessThanOrEqual(100);
    expect(getLine(first, "parse-readiness").score).toBe(25);
    expect(getLine(first, "section-structure").score).toBe(20);
    expect(getLine(first, "length-density").score).toBe(10);
    expect(getLine(first, "bullet-quality").score).toBeLessThan(20);
    expect(getLine(first, "bullet-quality").score).toBeGreaterThanOrEqual(15);
  });
});

describe("category breakdowns and plain-language reasons", () => {
  it("evaluates parse readiness for missing and unparseable contact fields", () => {
    const resume = makeIdealResume();
    resume.contact.email = "not-an-email";
    resume.contact.phone = "";
    const res = scoreResumeForAts(resume, { jobDescription: SAMPLE_JOB_DESCRIPTION });
    const line = getLine(res, "parse-readiness");

    expect(line.score).toBeLessThan(line.max);
    expect(line.reason).toMatch(/Missing phone/);
    expect(line.reason).toMatch(/unparseable email/);
  });

  it("evaluates section structure for missing sections, incomplete headings, and bad dates", () => {
    const resume = makeIdealResume();
    resume.education = [];
    resume.experience[0]!.startDate = "sometime-ago";
    resume.experience[0]!.endDate = "later";

    const res = scoreResumeForAts(resume, { jobDescription: SAMPLE_JOB_DESCRIPTION });
    const line = getLine(res, "section-structure");
    expect(line.score).toBeLessThan(15);
    expect(line.reason).toMatch(/Missing Education section/i);
    expect(line.reason).toMatch(/dates/i);
  });

  it("accepts single graduation year on education entries", () => {
    const resume = makeIdealResume();
    resume.education[0]!.startDate = "";
    resume.education[0]!.endDate = "2018";
    const res = scoreResumeForAts(resume, { jobDescription: SAMPLE_JOB_DESCRIPTION });
    expect(getLine(res, "section-structure").score).toBe(20);
  });

  it("evaluates keyword match against JD including 0-keyword JDs", () => {
    const resume = makeIdealResume();
    const noKeywordsJd = scoreResumeForAts(resume, {
      jobDescription: "We are looking for a strong team player with great communication.",
    });
    expect(getLine(noKeywordsJd, "keyword-match").score).toBe(0);
    expect(getLine(noKeywordsJd, "keyword-match").max).toBe(25);
    expect(getLine(noKeywordsJd, "keyword-match").reason).toMatch(/No extractable technical keywords/i);

    const partialJd = scoreResumeForAts(resume, {
      jobDescription: "Requirements: TypeScript, React, Kubernetes, Terraform.",
    });
    expect(getLine(partialJd, "keyword-match").score).toBe(13);
    expect(getLine(partialJd, "keyword-match").reason).toMatch(/Matched 2 of 4/);
  });

  it("evaluates bullet quality via atsAudit findings (action verbs, metrics, length)", () => {
    const resume = makeIdealResume();
    resume.projects = [];
    resume.experience[0]!.bullets = [
      { id: "b1", text: "Short bullet" },
      { id: "b2", text: "Responsible for maintaining the legacy billing system across multiple regions." },
      { id: "b3", text: STRONG_BULLET },
    ];
    const res = scoreResumeForAts(resume, { jobDescription: SAMPLE_JOB_DESCRIPTION });
    const line = getLine(res, "bullet-quality");

    expect(line.score).toBeGreaterThan(0);
    expect(line.score).toBeLessThan(20);
    expect(line.reason).toMatch(/1\/3 start with strong action verbs/);
    expect(line.reason).toMatch(/1\/3 include metrics/);
    expect(line.reason).toMatch(/2\/3 are 30-220 chars/);
  });

  it("evaluates length and density for low, target, and high word counts", () => {
    const shortResume = createEmptyResume();
    shortResume.summary = "Software engineer building web services.";
    const shortRes = scoreResumeForAts(shortResume, { jobDescription: SAMPLE_JOB_DESCRIPTION });
    expect(getLine(shortRes, "length-density").score).toBeLessThan(10);
    expect(getLine(shortRes, "length-density").reason).toMatch(/short/i);

    const longResume = makeIdealResume();
    longResume.summary = "scalable ".repeat(1100);
    const longRes = scoreResumeForAts(longResume, { jobDescription: SAMPLE_JOB_DESCRIPTION });
    expect(getLine(longRes, "length-density").score).toBeLessThan(10);
    expect(getLine(longRes, "length-density").reason).toMatch(/long/i);
  });
});

describe("isParseableDate and isParseableContactField helpers", () => {
  it.each([
    ["2020", false, true],
    ["2020-03", false, true],
    ["2020-03-15", false, true],
    ["03/2020", false, true],
    ["Mar 2020", false, true],
    ["September 2021", false, true],
    ["Spring 2022", false, true],
    ["Q3 2021", false, true],
    ["Expected May 2026", false, true],
    ["2019 - 2022", false, true],
    ["Jan 2020 - Present", false, true],
    ["Present", true, true],
    ["Ongoing", true, true],
    ["Present", false, false],
    ["2020-13", false, false],
    ["00/2020", false, false],
    ["sometime", false, false],
    ["", true, false],
  ])("isParseableDate(%j, allowOngoing=%s) -> %s", (input, allowOngoing, expected) => {
    expect(isParseableDate(input, allowOngoing)).toBe(expected);
  });

  it("validates contact fields accurately", () => {
    expect(isParseableContactField("fullName", "Ada Lovelace")).toBe(true);
    expect(isParseableContactField("fullName", "Jean-Luc Picard")).toBe(true);
    expect(isParseableContactField("fullName", "12345")).toBe(false);
    expect(isParseableContactField("fullName", "ada@example.com")).toBe(false);

    expect(isParseableContactField("email", "ada@example.com")).toBe(true);
    expect(isParseableContactField("email", "invalid-email")).toBe(false);

    expect(isParseableContactField("phone", "+1 (555) 013-2847")).toBe(true);
    expect(isParseableContactField("phone", "555-0100")).toBe(true);
    expect(isParseableContactField("phone", "2020-2024")).toBe(false);
    expect(isParseableContactField("phone", "123")).toBe(false);

    expect(isParseableContactField("location", "Austin, TX")).toBe(true);
    expect(isParseableContactField("location", "London")).toBe(true);
    expect(isParseableContactField("location", "Remote")).toBe(true);
    expect(isParseableContactField("location", "99999")).toBe(false);
  });
});

describe("property-based invariants (fast-check style arbitrary resume & malformed data)", () => {
  class Prng {
    private state: number;
    constructor(seed: number) {
      this.state = seed >>> 0;
    }
    next(): number {
      this.state = (this.state * 1664525 + 1013904223) >>> 0;
      return this.state;
    }
    int(min: number, max: number): number {
      return min + (this.next() % (max - min + 1));
    }
    pick<T>(items: readonly T[]): T {
      return items[this.next() % items.length]!;
    }
    bool(): boolean {
      return (this.next() & 1) === 1;
    }
    array<T>(gen: () => T, maxLen = 6): T[] {
      const len = this.int(0, maxLen);
      return Array.from({ length: len }, gen);
    }
  }

  const NAMES = ["", "   ", "Ada Lovelace", "Alex O'Connor", "12345", "a@b.com", "X", "Dr. Grace Hopper"];
  const EMAILS = ["", "ada@example.com", "bad-email", "@missing.com", "user@sub.domain.co.uk", "mailto:a@b.io"];
  const PHONES = ["", "+1 (555) 010-9988", "555-0100", "123", "2020-2022", "call-me", "+44 20 7946 0958"];
  const LOCATIONS = ["", "Austin, TX", "London, UK", "Remote", "12345", "https://bad.url", "San Francisco, CA"];
  const DATES = ["", "2020", "2021-05", "04/2019", "Jan 2022", "Present", "Ongoing", "bad-date", "2020-99", "Expected May 2026"];
  const BULLETS = [
    "",
    "Too short",
    "Responsible for maintaining services across the platform for several years.",
    "Built internal deployment dashboard for the engineering organization.",
    STRONG_BULLET,
    `Led migration of 15 services to Kubernetes ${"with extensive cross-team coordination ".repeat(8)}`,
  ];
  const SKILLS = ["", "TypeScript", "React", "Node.js", "Kubernetes", "PostgreSQL", "C++", "CI/CD", "Python"];
  const JDS = [
    undefined,
    "",
    "   ",
    "Team player with great communication skills.",
    "Looking for TypeScript, React, Node.js, PostgreSQL, and CI/CD experience.",
    SAMPLE_JOB_DESCRIPTION,
  ];

  function arbitraryResume(rng: Prng): ResumeData {
    const summaryWords = rng.int(0, 6);
    const summaryUnit = rng.pick([
      "",
      "Experienced software engineer delivering distributed systems and cloud services.",
      "word ".repeat(200),
    ]);
    return {
      contact: {
        fullName: rng.pick(NAMES),
        headline: rng.pick(["", "Software Engineer", "Staff Engineer"]),
        email: rng.pick(EMAILS),
        phone: rng.pick(PHONES),
        location: rng.pick(LOCATIONS),
        website: "",
        linkedin: "",
        github: "",
      },
      summary: Array.from({ length: summaryWords }, () => summaryUnit).join(" "),
      experience: rng.array(() => ({
        id: `e-${rng.next()}`,
        company: rng.pick(["", "Acme", "Northwind"]),
        role: rng.pick(["", "Engineer", "Senior Developer"]),
        location: rng.pick(LOCATIONS),
        startDate: rng.pick(DATES),
        endDate: rng.pick(DATES),
        bullets: rng.array(() => ({ id: `b-${rng.next()}`, text: rng.pick(BULLETS) }), 5),
      }), 4),
      projects: rng.array(() => ({
        id: `p-${rng.next()}`,
        name: rng.pick(["", "TraceKit", "DeployBot"]),
        link: "",
        description: rng.pick(["", "Open-source CLI tool"]),
        technologies: rng.array(() => rng.pick(SKILLS), 4),
        bullets: rng.array(() => ({ id: `pb-${rng.next()}`, text: rng.pick(BULLETS) }), 3),
      }), 3),
      skills: rng.array(() => ({
        id: `s-${rng.next()}`,
        category: rng.pick(["", "Languages", "Platform"]),
        items: rng.array(() => rng.pick(SKILLS), 6),
      }), 3),
      education: rng.array(() => ({
        id: `ed-${rng.next()}`,
        institution: rng.pick(["", "MIT", "University of Texas"]),
        degree: rng.pick(["", "B.S. Computer Science", "M.S. Software Engineering"]),
        location: rng.pick(LOCATIONS),
        startDate: rng.pick(DATES),
        endDate: rng.pick(DATES),
        details: rng.pick(["", "Graduated with honors"]),
      }), 2),
    };
  }

  it("holds bounds (0..100), weight conservation (sum max = 100), additive total, and determinism across 400 arbitrary resumes", () => {
    const rng = new Prng(0x5eed1234);
    for (let i = 0; i < 400; i++) {
      const resume = arbitraryResume(rng);
      const jd = rng.pick(JDS);
      const snapshot = structuredClone(resume);

      const res = scoreResumeForAts(resume, jd !== undefined ? { jobDescription: jd } : undefined);
      const resAgain = scoreResumeForAts(resume, jd !== undefined ? { jobDescription: jd } : undefined);

      expect(res).toEqual(resAgain);
      expect(resume).toEqual(snapshot);

      expect(Number.isInteger(res.total)).toBe(true);
      expect(res.total).toBeGreaterThanOrEqual(0);
      expect(res.total).toBeLessThanOrEqual(100);
      expect(res.breakdown).toHaveLength(5);

      const maxSum = res.breakdown.reduce((acc, line) => acc + line.max, 0);
      const scoreSum = res.breakdown.reduce((acc, line) => acc + line.score, 0);
      expect(maxSum).toBe(100);
      expect(res.total).toBe(scoreSum);

      for (const line of res.breakdown) {
        expect(Number.isInteger(line.score)).toBe(true);
        expect(Number.isInteger(line.max)).toBe(true);
        expect(line.score).toBeGreaterThanOrEqual(0);
        expect(line.score).toBeLessThanOrEqual(line.max);
        expect(line.reason.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("satisfies monotonicity: repairing contact fields or adding matching JD skills never lowers the score", () => {
    const rng = new Prng(0x99887766);
    const jd = "Required: TypeScript, React, Node.js, PostgreSQL, Kubernetes, CI/CD.";

    for (let i = 0; i < 150; i++) {
      const base = arbitraryResume(rng);
      const before = scoreResumeForAts(base, { jobDescription: jd });

      const withValidContact = structuredClone(base);
      withValidContact.contact.fullName = "Ada Lovelace";
      withValidContact.contact.email = "ada@example.com";
      withValidContact.contact.phone = "+1 (555) 013-2847";
      withValidContact.contact.location = "Austin, TX";

      const afterContact = scoreResumeForAts(withValidContact, { jobDescription: jd });
      expect(getLine(afterContact, "parse-readiness").score).toBeGreaterThanOrEqual(
        getLine(before, "parse-readiness").score,
      );

      const withMatchedSkills = structuredClone(withValidContact);
      withMatchedSkills.skills = [
        ...withMatchedSkills.skills,
        {
          id: "injected-skills",
          category: "Matched",
          items: ["TypeScript", "React", "Node.js", "PostgreSQL", "Kubernetes", "CI/CD"],
        },
      ];
      const afterSkills = scoreResumeForAts(withMatchedSkills, { jobDescription: jd });
      expect(getLine(afterSkills, "keyword-match").score).toBeGreaterThanOrEqual(
        getLine(afterContact, "keyword-match").score,
      );
    }
  });

  it("never throws on null, undefined, primitives, or deeply malformed resume objects", () => {
    const malformedInputs: unknown[] = [
      null,
      undefined,
      42,
      "not a resume",
      [],
      {},
      { contact: null, summary: 123, experience: "bad", projects: null, skills: {}, education: [null, 42, {}] },
      {
        contact: { fullName: ["bad"], email: null, phone: {}, location: true },
        experience: [{ bullets: "not-an-array", startDate: 2020, endDate: null }],
        projects: [{ technologies: "ts", bullets: [null, { text: 999 }] }],
        skills: [{ items: [null, 123, "React"] }],
      },
    ];

    for (const bad of malformedInputs) {
      const res = scoreResumeForAts(bad as ResumeData, { jobDescription: undefined });
      expect(res.total).toBeGreaterThanOrEqual(0);
      expect(res.total).toBeLessThanOrEqual(100);
      expect(res.total).toBeLessThan(20);
      expect(res.breakdown).toHaveLength(5);
    }
  });
});
