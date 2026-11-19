import { describe, expect, it } from "vitest";
import { analyzeJobDescription, tokenizeTechnicalText, type AuditableResume } from "./jdEngine";

function resumeWith(skills: string[], bullets: string[] = []): AuditableResume {
  return {
    contact: { fullName: "A", email: "a@b.c", phone: "1", location: "X" },
    summary: "",
    experience: [{ id: "e1", company: "Co", role: "Engineer", bullets: bullets.map((text, i) => ({ id: `b${i}`, text })) }],
    projects: [],
    skills: [{ category: "Tech", items: skills }],
  };
}

const keywords = (chips: { keyword: string }[]) => chips.map((c) => c.keyword);

describe("tokenizeTechnicalText", () => {
  it.each([
    ["C++", "c++"],
    ["C#", "c#"],
    ["F#", "f#"],
    [".NET", ".net"],
    ["ASP.NET", "asp.net"],
    ["Node.js", "node.js"],
    ["Next.js", "next.js"],
    ["React.js", "React"],
    ["Vue.js", "vue.js"],
    ["CI/CD", "ci/cd"],
    ["TCP/IP", "tcp/ip"],
    ["UI/UX", "ui/ux"],
    ["S3", "s3"],
    ["K8s", "kubernetes"],
  ])("keeps %s intact", (input, expected) => {
    expect(tokenizeTechnicalText(`We use ${input} daily`)).toContain(expected.toLowerCase());
  });

  it("strips sentence punctuation without corrupting symbol tokens", () => {
    const tokens = tokenizeTechnicalText("Experience with C++, .NET, and Node.js.");
    expect(tokens).toEqual(["experience", "with", "c++", ".net", "and", "node.js"]);
    expect(tokenizeTechnicalText("(C#): F#; Node.js!")).toEqual(["c#", "f#", "node.js"]);
  });

  it("splits slash compounds while keeping the compound", () => {
    expect(tokenizeTechnicalText("REST/GraphQL")).toEqual(["rest/graphql", "rest", "graphql"]);
  });

  it("normalizes aliases", () => {
    expect(tokenizeTechnicalText("NodeJS cicd TS Postgres")).toEqual(["node.js", "ci/cd", "typescript", "postgresql"]);
  });
});

describe("analyzeJobDescription", () => {
  it.each(["C++", "C#", ".NET", "Node.js", "CI/CD", "F#"])("matches %s", (tech) => {
    const result = analyzeJobDescription(resumeWith([tech]), `Requirements: ${tech}.`);
    expect(keywords(result.matched)).toContain(tech);
    expect(result.missing).toEqual([]);
    expect(result.score).toBe(100);
  });

  it("extracts punctuation-adjacent tokens", () => {
    const result = analyzeJobDescription(resumeWith(["C++"]), "Experience with C++, .NET, and Node.js.");
    expect(keywords(result.matched)).toEqual(["C++"]);
    expect(keywords(result.missing).sort()).toEqual([".NET", "Node.js"]);
    expect(result.totalKeywords).toBe(3);
    expect(result.score).toBe(33);
  });

  it("matches multi-word phrases", () => {
    const resume = resumeWith([], ["Built distributed systems and a design system", "Applied machine learning"]);
    const result = analyzeJobDescription(resume, "Distributed systems, design systems, and machine learning.");
    expect(keywords(result.matched).sort()).toEqual(["design systems", "distributed systems", "machine learning"]);
    expect(result.score).toBe(100);
  });

  it("reports missing phrases", () => {
    const result = analyzeJobDescription(resumeWith(["React"]), "Machine learning and React.");
    expect(keywords(result.missing)).toEqual(["machine learning"]);
  });

  it("matches aliases in both directions", () => {
    const result = analyzeJobDescription(resumeWith(["k8s", "NodeJS", "Postgres", "TS", "CICD"]), "Kubernetes, Node.js, PostgreSQL, TypeScript, CI/CD");
    expect(result.missing).toEqual([]);
    expect(result.matched).toHaveLength(5);
  });

  it("returns an empty zero result for a blank JD", () => {
    const empty = { score: 0, matched: [], missing: [], totalKeywords: 0 };
    expect(analyzeJobDescription(resumeWith(["React"]), "")).toEqual(empty);
    expect(analyzeJobDescription(resumeWith(["React"]), "  \n\t ")).toEqual(empty);
  });

  it("keeps score within 0..100 and sorts by frequency", () => {
    const jd = "Python python Python. Docker, Docker. Kubernetes. Terraform.";
    const none = analyzeJobDescription(resumeWith([]), jd);
    const all = analyzeJobDescription(resumeWith(["Python", "Docker", "Kubernetes", "Terraform"]), jd);
    expect(none.score).toBe(0);
    expect(all.score).toBe(100);
    expect(none.missing[0]).toEqual({ keyword: "python", count: 3 });
    expect(none.missing[1]).toEqual({ keyword: "docker", count: 2 });
  });

  it("does not treat stopwords or fluff as keywords", () => {
    const result = analyzeJobDescription(resumeWith([]), "We are looking for a strong team player with excellent communication.");
    expect(result.totalKeywords).toBe(0);
  });
});
