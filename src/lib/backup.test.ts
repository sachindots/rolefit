import { createSampleWorkspace } from "../data/sampleWorkspace";
import type { WorkspaceState } from "../types/resume";
import {
  BACKUP_SCHEMA_VERSION,
  buildBackupFilename,
  downloadBackupFile,
  importBackupJson,
  MAX_BACKUP_BYTES,
  serializeBackup,
} from "./backup";

function envelope(mutate: (w: WorkspaceState) => void = () => undefined): string {
  const state = createSampleWorkspace();
  mutate(state);
  return serializeBackup(state);
}

function importWith(mutate: (resume: Record<string, any>) => void) {
  const env = JSON.parse(envelope());
  mutate(env.workspace.resume);
  return importBackupJson(JSON.stringify(env));
}

function expectOk(r: ReturnType<typeof importBackupJson>) {
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("serializeBackup / round trip", () => {
  it("writes the envelope", () => {
    const parsed = JSON.parse(serializeBackup(createSampleWorkspace()));
    expect(parsed.app).toBe("rolefit");
    expect(parsed.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(new Date(parsed.exportedAt).toISOString()).toBe(parsed.exportedAt);
    expect(Object.keys(parsed.workspace).sort()).toEqual(["jobDescription", "pageSize", "resume", "template", "theme"]);
    expect(serializeBackup(createSampleWorkspace())).toContain("\n  ");
  });

  it("imports what it exported with no warnings", () => {
    const r = expectOk(importBackupJson(envelope()));
    expect(r.state).toEqual(createSampleWorkspace());
    expect(r.warnings).toEqual([]);
  });

  it("accepts a raw WorkspaceState", () => {
    const r = expectOk(importBackupJson(JSON.stringify(createSampleWorkspace())));
    expect(r.state).toEqual(createSampleWorkspace());
  });
});

describe("buildBackupFilename", () => {
  it.each([
    ["Alex Chen", "rolefit-alex-chen-backup.json"],
    ["José Núñez-O'Brien", "rolefit-jose-nunez-o-brien-backup.json"],
    ["../../etc/passwd", "rolefit-etc-passwd-backup.json"],
    ["a\\b:c*?\"<>|\u0000", "rolefit-a-b-c-backup.json"],
    ["", "rolefit-backup.json"],
    ["   ", "rolefit-backup.json"],
    ["日本語", "rolefit-backup.json"],
  ])("%j -> %s", (name, expected) => {
    expect(buildBackupFilename(name)).toBe(expected);
  });

  it("caps the slug length", () => {
    expect(buildBackupFilename("a".repeat(200)).length).toBeLessThanOrEqual("rolefit--backup.json".length + 40);
  });
});

describe("downloadBackupFile", () => {
  it("clicks a download link and revokes the object URL", () => {
    const create = vi.fn(() => "blob:test");
    const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("rolefit-alex-morgan-backup.json");
      expect(this.href).toBe("blob:test");
    });
    try {
      downloadBackupFile(createSampleWorkspace());
      expect(click).toHaveBeenCalledOnce();
      expect(revoke).toHaveBeenCalledWith("blob:test");
      expect(document.querySelector("a[download]")).toBeNull();
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

describe("importBackupJson rejects bad input", () => {
  it.each([
    ["empty", ""],
    ["whitespace", "  \n"],
    ["malformed", "{not json"],
    ["truncated", envelope().slice(0, 200)],
    ["array", "[]"],
    ["null", "null"],
    ["string", '"hi"'],
  ])("%s", (_n, text) => {
    const r = importBackupJson(text);
    expect(r.ok).toBe(false);
  });

  it("rejects oversized payloads by byte length", () => {
    const multibyte = "€".repeat(Math.ceil(MAX_BACKUP_BYTES / 3) + 1);
    expect(multibyte.length).toBeLessThan(MAX_BACKUP_BYTES);
    const r = importBackupJson(JSON.stringify({ schemaVersion: 1, pad: multibyte }));
    expect(r).toEqual({ ok: false, error: "Backup is larger than 512 KB." });
  });

  it("rejects deep nesting", () => {
    let deep: unknown = "x";
    for (let i = 0; i < 30; i++) deep = { a: deep };
    const env = JSON.parse(envelope());
    env.workspace.extra = deep;
    const r = importBackupJson(JSON.stringify(env));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nested/);
  });

  it("survives extreme nesting without throwing", () => {
    const text = "[".repeat(100000) + "]".repeat(100000);
    expect(importBackupJson(text).ok).toBe(false);
  });

  it.each([
    ["missing", undefined],
    ["unsupported", 2],
    ["string", "1"],
  ])("rejects %s schemaVersion", (_n, version) => {
    const env = JSON.parse(envelope());
    env.schemaVersion = version;
    expect(importBackupJson(JSON.stringify(env)).ok).toBe(false);
    const raw = { ...createSampleWorkspace(), schemaVersion: version };
    expect(importBackupJson(JSON.stringify(raw)).ok).toBe(false);
  });

  it("rejects a foreign app and non-object workspace", () => {
    const env = JSON.parse(envelope());
    expect(importBackupJson(JSON.stringify({ ...env, app: "other" })).ok).toBe(false);
    expect(importBackupJson(JSON.stringify({ ...env, workspace: [] })).ok).toBe(false);
  });

  it("rejects missing and wrong-type fields", () => {
    expect(importWith((r) => delete r.skills).ok).toBe(false);
    expect(importWith((r) => (r.summary = 42)).ok).toBe(false);
    expect(importWith((r) => (r.experience = "nope")).ok).toBe(false);
    expect(importWith((r) => (r.experience[0].bullets[0].text = null)).ok).toBe(false);
    const env = JSON.parse(envelope());
    env.workspace.template = "fancy";
    expect(importBackupJson(JSON.stringify(env)).ok).toBe(false);
  });

  it("enforces string and array limits", () => {
    expect(importWith((r) => (r.summary = "x".repeat(5000))).ok).toBe(false);
    expect(importWith((r) => (r.experience = Array.from({ length: 100 }, () => r.experience[0]))).ok).toBe(false);
  });
});

describe("prototype pollution", () => {
  afterEach(() => {
    delete (Object.prototype as Record<string, unknown>).polluted;
  });

  it.each(["__proto__", "constructor", "prototype"])("rejects %s keys", (key) => {
    const text = envelope().replace('"resume": {', `"resume": {\n "${key}": {"polluted": true},`);
    const r = importBackupJson(text);
    expect(r.ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("rejects nested __proto__ in raw state and leaves Object.prototype clean", () => {
    const r = importBackupJson('{"schemaVersion":1,"__proto__":{"polluted":true}}');
    expect(r.ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("never copies unknown keys into the state", () => {
    const env = JSON.parse(envelope());
    env.workspace.resume.extra = "x";
    env.workspace.resume.contact.ssn = "x";
    const r = expectOk(importBackupJson(JSON.stringify(env)));
    expect(JSON.stringify(r.state)).not.toContain("ssn");
    expect("extra" in r.state.resume).toBe(false);
  });
});

describe("XSS sanitization", () => {
  it.each([
    ["<script>alert(1)</script>Led team", "Led team"],
    ["<SCRIPT src=x>evil()</ScRiPt>Led team", "Led team"],
    ["Led <img src=x onerror=alert(1)>team", "Led team"],
    ["Led <svg/onload=alert(1)>team", "Led team"],
    ["Led <iframe src=//evil></iframe>team", "Led team"],
    ["Led <b>bold</b> team", "Led bold team"],
    ["Led <scr<script>ipt>alert(1)</scr</script>ipt>team", "Led team"],
    ["Led onerror=alert(1) team", "Led alert(1) team"],
    ["Led <script>alert(1) team", "Led alert(1) team"],
  ])("sanitizes %j", (input, expected) => {
    const r = expectOk(importWith((resume) => (resume.experience[0].bullets[0].text = input)));
    const out = r.state.resume.experience[0]!.bullets[0]!.text;
    expect(out).toBe(expected);
    expect(out).not.toMatch(/<|onerror|onload/i);
    expect(r.warnings.join(" ")).toMatch(/HTML or script/);
  });

  it("sanitizes every string field, not just bullets", () => {
    const r = expectOk(
      importWith((resume) => {
        resume.contact.fullName = "<script>x</script>Alex";
        resume.summary = "<img src=x onerror=alert(1)>Hello";
        resume.skills[0].items = ["<b>TS</b>"];
        resume.projects[0].technologies = ["<svg onload=x>Node"];
      }),
    );
    expect(r.state.resume.contact.fullName).toBe("Alex");
    expect(r.state.resume.summary).toBe("Hello");
    expect(r.state.resume.skills[0]!.items).toEqual(["TS"]);
    expect(r.state.resume.projects[0]!.technologies).toEqual(["Node"]);
  });

  it("sanitizes the job description", () => {
    const env = JSON.parse(envelope());
    env.workspace.jobDescription = "Need React<script>alert(1)</script>\nand Node";
    const r = expectOk(importBackupJson(JSON.stringify(env)));
    expect(r.state.jobDescription).toBe("Need React\nand Node");
  });

  it("keeps harmless text with angle brackets and symbols", () => {
    const r = expectOk(importWith((resume) => (resume.experience[0].bullets[0].text = "Cut latency from 9 < 3 ms using C++ & CI/CD")));
    expect(r.state.resume.experience[0]!.bullets[0]!.text).toBe("Cut latency from 9 < 3 ms using C++ & CI/CD");
    expect(r.warnings).toEqual([]);
  });

  it("strips control characters, keeping newline/tab only in multiline fields", () => {
    const r = expectOk(
      importWith((resume) => {
        resume.summary = "a\u0000b\tc\nd\u0007e\r\nf";
        resume.contact.headline = "x\u0000y\nz\tw";
      }),
    );
    expect(r.state.resume.summary).toBe("ab\tc\nde\nf");
    expect(r.state.resume.contact.headline).toBe("xyzw");
    expect(r.warnings.join(" ")).toMatch(/control characters/);
  });
});

describe("URL sanitization", () => {
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "//evil.com/x",
    "  java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "java script:alert(1)",
    "\u0000javascript:alert(1)",
    "ftp://x.com",
    "https://a.com/\"onmouseover=x",
    "https://a.com/<b>",
  ])("drops %j with a warning", (url) => {
    const r = expectOk(
      importWith((resume) => {
        resume.contact.website = url;
        resume.projects[0].link = url;
      }),
    );
    expect(r.state.resume.contact.website).toBe("");
    expect(r.state.resume.projects[0]!.link).toBe("");
    expect(r.warnings.join(" ")).toMatch(/unsafe link/);
  });

  it.each(["https://example.com/a?b=1", "http://example.com", "mailto:a@b.com", ""])("keeps %j", (url) => {
    const r = expectOk(importWith((resume) => (resume.contact.linkedin = url)));
    expect(r.state.resume.contact.linkedin).toBe(url);
    expect(r.warnings).toEqual([]);
  });
});
