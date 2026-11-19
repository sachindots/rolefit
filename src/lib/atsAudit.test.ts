import { describe, expect, it } from "vitest";
import { auditResume } from "./atsAudit";
import type { AuditableResume } from "./jdEngine";

const STRONG = "Reduced API p95 latency by 42% by migrating the checkout service to Go";

function makeResume(overrides: Partial<AuditableResume> = {}, bullets: string[] = [STRONG]): AuditableResume {
  return {
    contact: { fullName: "Ada Lovelace", email: "ada@example.com", phone: "555-0100", location: "London" },
    summary: "Engineer.",
    experience: [{ id: "e1", company: "Acme", role: "Engineer", bullets: bullets.map((text, i) => ({ id: `b${i}`, text })) }],
    projects: [],
    skills: [{ category: "Languages", items: ["Go"] }],
    ...overrides,
  };
}

const codes = (r: ReturnType<typeof auditResume>) => r.findings.map((f) => f.code);
const bulletCodes = (r: ReturnType<typeof auditResume>) => r.findings.filter((f) => f.bulletId).map((f) => f.code);

describe("auditResume bullets", () => {
  it.each([
    "Responsible for maintaining the billing platform across 3 teams",
    "Helped the team ship the new onboarding flow to 10k users",
    "Assisted senior engineers with 20 production releases",
    "Worked on the search indexing pipeline for 5 services",
    "Duties included triaging 40 support tickets weekly",
    "Tasked with migrating 12 services to Kubernetes",
    "Participated in 30 design reviews for the platform",
    "Involved in rewriting the 2M line monolith",
  ])("flags weak opening: %s", (text) => {
    const result = auditResume(makeResume({}, [text]));
    const finding = result.findings.find((f) => f.code === "weak-opening");
    expect(finding).toMatchObject({ severity: "warning", section: "experience", entryId: "e1", bulletId: "b0" });
    expect(finding?.suggestion).toMatch(/strong action verb/);
  });

  it("flags bullets without metrics as info", () => {
    const result = auditResume(makeResume({}, ["Built the internal dashboard for the support organization"]));
    expect(result.findings.find((f) => f.code === "missing-metric")).toMatchObject({ severity: "info", bulletId: "b0" });
  });

  it.each(["Cut build time by 35%", "Saved $120k annually through vendor consolidation", "Served millions of requests per day reliably"])(
    "accepts metric: %s",
    (text) => {
      expect(bulletCodes(auditResume(makeResume({}, [text])))).not.toContain("missing-metric");
    },
  );

  it("passes a strong quantified bullet cleanly", () => {
    const result = auditResume(makeResume());
    expect(bulletCodes(result)).toEqual([]);
    expect(result.bulletsAnalyzed).toBe(1);
  });

  it("flags short and long bullets", () => {
    const short = auditResume(makeResume({}, ["Fixed bugs 5"]));
    expect(bulletCodes(short)).toEqual(["bullet-too-short"]);
    const long = auditResume(makeResume({}, [`${STRONG} ${"and more ".repeat(30)}`]));
    expect(bulletCodes(long)).toEqual(["bullet-too-long"]);
  });

  it("audits project bullets with the project id", () => {
    const resume = makeResume({
      projects: [{ id: "p1", name: "Tool", description: "", technologies: [], bullets: [{ id: "pb1", text: "Responsible for the tool in 2 teams" }] }],
    });
    expect(auditResume(resume).findings.find((f) => f.section === "projects")).toMatchObject({ entryId: "p1", bulletId: "pb1" });
  });
});

describe("auditResume document hygiene", () => {
  it("flags missing contact fields, summary, and skills", () => {
    const result = auditResume(
      makeResume({ contact: { fullName: "", email: " ", phone: "", location: "" }, summary: " ", skills: [{ category: "Tech", items: [] }] }),
    );
    expect(codes(result)).toEqual(
      expect.arrayContaining(["missing-fullName", "missing-email", "missing-phone", "missing-location", "missing-summary", "empty-skills"]),
    );
    expect(result.findings.find((f) => f.code === "missing-summary")?.severity).toBe("info");
  });

  it("flags low and high word counts", () => {
    expect(codes(auditResume(makeResume()))).toContain("word-count-low");
    const big = makeResume({ summary: "word ".repeat(1000) });
    expect(codes(auditResume(big))).toContain("word-count-high");
    const mid = makeResume({ summary: "word ".repeat(200) });
    expect(codes(auditResume(mid))).not.toContain("word-count-low");
    expect(codes(auditResume(mid))).not.toContain("word-count-high");
  });

  it("returns consistent counts and unique ids", () => {
    const result = auditResume(makeResume({ summary: "" }, ["Helped", "Responsible for stuff for the company overall"]));
    expect(result.counts.total).toBe(result.findings.length);
    expect(result.counts.warning + result.counts.info).toBe(result.counts.total);
    expect(new Set(result.findings.map((f) => f.id)).size).toBe(result.findings.length);
  });
});
