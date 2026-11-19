import {
  AI_STORAGE_KEY,
  DEFAULT_GEMINI_MODEL,
  clearAiSettings,
  isValidApiKey,
  loadAiSettings,
  saveAiSettings,
  type AiStorages,
} from "./aiSettings";

const KEY = "AIzaSyTestKey_1234567890abcdef-XYZ";
const ENV_KEY = "AIzaSyEnvKey_1234567890abcdef-XYZ";

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}
const stores = (): AiStorages => ({ session: memory(), local: memory() });
const noEnv = { dev: false };

describe("saveAiSettings / loadAiSettings", () => {
  it("defaults to sessionStorage and leaves localStorage empty", () => {
    const s = stores();
    expect(saveAiSettings({ apiKey: KEY, model: "gemini-2.5-pro", storageMode: "session" }, s)).toEqual({ ok: true });
    expect(s.session!.getItem(AI_STORAGE_KEY)).toContain(KEY);
    expect(s.local!.getItem(AI_STORAGE_KEY)).toBeNull();
    expect(loadAiSettings(s, noEnv)).toEqual({ apiKey: KEY, model: "gemini-2.5-pro", storageMode: "session", source: "user" });
  });

  it("persists to localStorage only on explicit opt-in, and clears the session copy", () => {
    const s = stores();
    saveAiSettings({ apiKey: KEY, model: DEFAULT_GEMINI_MODEL, storageMode: "session" }, s);
    saveAiSettings({ apiKey: KEY, model: DEFAULT_GEMINI_MODEL, storageMode: "local" }, s);
    expect(s.session!.getItem(AI_STORAGE_KEY)).toBeNull();
    expect(loadAiSettings(s, noEnv)).toMatchObject({ storageMode: "local", source: "user", apiKey: KEY });
  });

  it("switching back from local to session removes the key from localStorage", () => {
    const s = stores();
    saveAiSettings({ apiKey: KEY, model: DEFAULT_GEMINI_MODEL, storageMode: "local" }, s);
    saveAiSettings({ apiKey: KEY, model: DEFAULT_GEMINI_MODEL, storageMode: "session" }, s);
    expect(s.local!.getItem(AI_STORAGE_KEY)).toBeNull();
  });

  it("trims the key and rejects malformed keys and models without echoing the key", () => {
    const s = stores();
    expect(saveAiSettings({ apiKey: `  ${KEY}  `, model: DEFAULT_GEMINI_MODEL, storageMode: "session" }, s).ok).toBe(true);
    for (const bad of ["", "short", "has spaces in the middle of it 123456", `${KEY}\n<script>`, "x".repeat(300)]) {
      const r = saveAiSettings({ apiKey: bad, model: DEFAULT_GEMINI_MODEL, storageMode: "session" }, stores());
      expect(r.ok).toBe(false);
      if (!r.ok && bad.length > 5) expect(r.error).not.toContain(bad);
    }
    const bad = saveAiSettings({ apiKey: KEY, model: "gpt-4" as never, storageMode: "session" }, stores());
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).not.toContain(KEY);
  });

  it("reports unavailable and full storage without throwing or leaking the key", () => {
    const none = saveAiSettings({ apiKey: KEY, model: DEFAULT_GEMINI_MODEL, storageMode: "session" }, { session: null, local: null });
    expect(none.ok).toBe(false);
    const full: Storage = { ...memory(), setItem: () => { throw new DOMException("full", "QuotaExceededError"); } };
    const r = saveAiSettings({ apiKey: KEY, model: DEFAULT_GEMINI_MODEL, storageMode: "local" }, { session: memory(), local: full });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(KEY);
  });

  it("ignores corrupt or invalid stored records", () => {
    for (const raw of ["{nope", "null", '"str"', JSON.stringify({ apiKey: "bad key" }), JSON.stringify({ model: "gemini-2.5-pro" })]) {
      const s = stores();
      s.session!.setItem(AI_STORAGE_KEY, raw);
      expect(loadAiSettings(s, noEnv).source).toBe("none");
    }
  });

  it("falls back to the default model for an unknown stored model", () => {
    const s = stores();
    s.session!.setItem(AI_STORAGE_KEY, JSON.stringify({ apiKey: KEY, model: "evil" }));
    expect(loadAiSettings(s, noEnv).model).toBe(DEFAULT_GEMINI_MODEL);
  });

  it("returns an empty none-source setting when nothing is stored", () => {
    expect(loadAiSettings(stores(), noEnv)).toEqual({ apiKey: "", model: DEFAULT_GEMINI_MODEL, storageMode: "session", source: "none" });
    expect(loadAiSettings({ session: null, local: null }, noEnv).source).toBe("none");
  });

  it("survives throwing storages", () => {
    const boom: Storage = { ...memory(), getItem: () => { throw new Error("denied"); } };
    expect(loadAiSettings({ session: boom, local: boom }, noEnv).source).toBe("none");
  });
});

describe("dev-env fallback", () => {
  it("uses the env key only when dev is true", () => {
    expect(loadAiSettings(stores(), { dev: true, key: ENV_KEY })).toEqual({
      apiKey: ENV_KEY, model: DEFAULT_GEMINI_MODEL, storageMode: "session", source: "dev-env",
    });
    expect(loadAiSettings(stores(), { dev: false, key: ENV_KEY }).source).toBe("none");
  });

  it("prefers a user-entered key over the env key", () => {
    const s = stores();
    saveAiSettings({ apiKey: KEY, model: DEFAULT_GEMINI_MODEL, storageMode: "session" }, s);
    expect(loadAiSettings(s, { dev: true, key: ENV_KEY })).toMatchObject({ apiKey: KEY, source: "user" });
  });

  it("ignores malformed env keys", () => {
    expect(loadAiSettings(stores(), { dev: true, key: "oops" }).source).toBe("none");
    expect(loadAiSettings(stores(), { dev: true }).source).toBe("none");
  });

  it("reads the real build env in tests (dev mode, no key configured)", () => {
    expect(import.meta.env.DEV).toBe(true);
    expect(loadAiSettings({ session: null, local: null }).source).toBe(import.meta.env.VITE_GEMINI_API_KEY ? "dev-env" : "none");
  });
});

describe("clearAiSettings", () => {
  it("removes the key from both storages", () => {
    const s = stores();
    s.session!.setItem(AI_STORAGE_KEY, "x");
    s.local!.setItem(AI_STORAGE_KEY, "y");
    clearAiSettings(s);
    expect(s.session!.getItem(AI_STORAGE_KEY)).toBeNull();
    expect(s.local!.getItem(AI_STORAGE_KEY)).toBeNull();
  });

  it("does not throw on unavailable or failing storage", () => {
    const boom: Storage = { ...memory(), removeItem: () => { throw new Error("denied"); } };
    expect(() => clearAiSettings({ session: boom, local: null })).not.toThrow();
  });
});

describe("isValidApiKey", () => {
  it.each([KEY, "a".repeat(16)])("accepts %s", (k) => expect(isValidApiKey(k)).toBe(true));
  it.each(["", "short", "a b".repeat(10), "a".repeat(257), "key\nwith-newline-1234567"])("rejects %j", (k) => expect(isValidApiKey(k)).toBe(false));
});

describe("never logs keys", () => {
  it("does not touch the console", () => {
    const spies = (["log", "warn", "error", "info", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const s = stores();
    saveAiSettings({ apiKey: KEY, model: DEFAULT_GEMINI_MODEL, storageMode: "local" }, s);
    loadAiSettings(s, noEnv);
    clearAiSettings(s);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
