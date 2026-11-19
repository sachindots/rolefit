import { createSampleWorkspace } from "../data/sampleWorkspace";
import {
  createEmptyResume,
  createEmptyWorkspace,
  createId,
  isSafeUrl,
  LIMITS,
  moveItem,
  validateResume,
  validateWorkspaceState,
} from "./schema";

const sample = () => createSampleWorkspace();

describe("isSafeUrl", () => {
  it.each(["", "https://a.com", "http://a.com/x?y=1", "mailto:a@b.com"])("allows %j", (u) => {
    expect(isSafeUrl(u)).toBe(true);
  });
  it.each(["javascript:alert(1)", "data:text/html,x", "ftp://a.com", "file:///etc/passwd", "a.com", " https://a.com", "JaVaScRiPt:alert(1)"])(
    "rejects %j",
    (u) => {
      expect(isSafeUrl(u)).toBe(false);
    },
  );
});

describe("validateResume", () => {
  it("accepts empty and sample resumes", () => {
    expect(validateResume(createEmptyResume()).ok).toBe(true);
    expect(validateResume(sample().resume).ok).toBe(true);
  });

  it("rejects non-objects and wrong types", () => {
    expect(validateResume(null).ok).toBe(false);
    expect(validateResume([]).ok).toBe(false);
    const bad = { ...createEmptyResume(), summary: 5 };
    const r = validateResume(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("resume.summary must be a string");
  });

  it("rejects missing sections", () => {
    const { skills: _skills, ...rest } = createEmptyResume();
    expect(validateResume(rest).ok).toBe(false);
  });

  it("rejects unsafe URLs in contact and project links", () => {
    const a = sample().resume;
    a.contact.website = "javascript:alert(1)";
    expect(validateResume(a).ok).toBe(false);
    const b = sample().resume;
    b.projects[0]!.link = "data:text/html,x";
    expect(validateResume(b).ok).toBe(false);
  });

  it("enforces length bounds and array caps", () => {
    const a = sample().resume;
    a.summary = "x".repeat(LIMITS.summary + 1);
    expect(validateResume(a).ok).toBe(false);
    const b = sample().resume;
    b.experience[0]!.bullets = Array.from({ length: LIMITS.bullets + 1 }, (_, i) => ({ id: `b${i}`, text: "x" }));
    expect(validateResume(b).ok).toBe(false);
    const c = sample().resume;
    c.skills[0]!.items = Array.from({ length: LIMITS.tags + 1 }, () => "x");
    expect(validateResume(c).ok).toBe(false);
  });

  it("rejects empty ids and non-string array entries", () => {
    const a = sample().resume;
    a.experience[0]!.id = " ";
    expect(validateResume(a).ok).toBe(false);
    const b = sample().resume as unknown as { skills: { items: unknown[] }[] };
    b.skills[0]!.items = [1];
    expect(validateResume(b).ok).toBe(false);
  });

  it("strips unknown keys at every level", () => {
    const input = sample().resume as unknown as Record<string, unknown>;
    input.extra = 1;
    (input.contact as Record<string, unknown>).ssn = "x";
    ((input.experience as Record<string, unknown>[])[0]!.bullets as Record<string, unknown>[])[0]!.evil = true;
    const r = validateResume(input);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual(sample().resume);
      expect("extra" in r.value).toBe(false);
    }
  });
});

describe("validateWorkspaceState", () => {
  it("accepts empty and sample workspaces", () => {
    expect(validateWorkspaceState(createEmptyWorkspace()).ok).toBe(true);
    expect(validateWorkspaceState(sample()).ok).toBe(true);
  });

  it.each([
    ["schemaVersion", 2],
    ["template", "fancy"],
    ["pageSize", "legal"],
    ["theme", "blue"],
    ["jobDescription", 3],
  ])("rejects invalid %s", (key, value) => {
    expect(validateWorkspaceState({ ...sample(), [key]: value }).ok).toBe(false);
  });

  it("rejects an oversized job description and invalid resume", () => {
    expect(validateWorkspaceState({ ...sample(), jobDescription: "x".repeat(LIMITS.jobDescription + 1) }).ok).toBe(false);
    expect(validateWorkspaceState({ ...sample(), resume: null }).ok).toBe(false);
    expect(validateWorkspaceState("nope").ok).toBe(false);
  });

  it("strips unknown top-level keys", () => {
    const r = validateWorkspaceState({ ...sample(), injected: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect("injected" in r.value).toBe(false);
  });
});

describe("moveItem", () => {
  it("moves forward and backward without mutating", () => {
    const src = ["a", "b", "c", "d"];
    expect(moveItem(src, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(src, 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(src).toEqual(["a", "b", "c", "d"]);
  });

  it.each([
    [-1, 1],
    [0, 4],
    [4, 0],
    [1, -1],
    [1.5, 2],
    [2, 2],
  ])("returns a copy unchanged for out-of-range or no-op (%d -> %d)", (from, to) => {
    const src = ["a", "b", "c", "d"];
    const out = moveItem(src, from, to);
    expect(out).toEqual(src);
    expect(out).not.toBe(src);
  });
});

describe("createId", () => {
  it("generates unique ids", () => {
    expect(new Set(Array.from({ length: 100 }, createId)).size).toBe(100);
  });

  it("falls back without crypto.randomUUID", () => {
    vi.stubGlobal("crypto", {});
    try {
      const a = createId();
      const b = createId();
      expect(a).not.toBe(b);
      expect(a).toMatch(/^id-/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("sample workspace", () => {
  it("references the technical tokens the JD match needs", () => {
    const jd = sample().jobDescription;
    for (const t of ["TypeScript", "React", "Node.js", "C++", "CI/CD", "PostgreSQL", "distributed systems", "design systems"]) {
      expect(jd).toContain(t);
    }
  });
});
