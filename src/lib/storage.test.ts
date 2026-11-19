import { createSampleWorkspace } from "../data/sampleWorkspace";
import { createEmptyWorkspace } from "./schema";
import { loadWorkspaceState, saveWorkspaceState, STORAGE_KEY } from "./storage";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
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

const throwing = (): never => {
  throw new DOMException("denied", "QuotaExceededError");
};

describe("storage", () => {
  it("uses the versioned key", () => {
    expect(STORAGE_KEY).toBe("rolefit.workspace.v1");
  });

  it("preloads the sample workspace on first visit", () => {
    const r = loadWorkspaceState(memoryStorage());
    expect(r.recovered).toBe(false);
    expect(r.state).toEqual(createSampleWorkspace());
  });

  it("round-trips saved state", () => {
    const s = memoryStorage();
    const state = { ...createEmptyWorkspace(), theme: "dark" as const, jobDescription: "hello" };
    expect(saveWorkspaceState(state, s)).toBe(true);
    expect(loadWorkspaceState(s)).toEqual({ state, recovered: false });
  });

  it("recovers from corrupt JSON", () => {
    const r = loadWorkspaceState(memoryStorage({ [STORAGE_KEY]: "{not json" }));
    expect(r).toEqual({ state: createSampleWorkspace(), recovered: true });
  });

  it("recovers from schema-invalid or incompatible data", () => {
    const bad = JSON.stringify({ ...createEmptyWorkspace(), schemaVersion: 2 });
    expect(loadWorkspaceState(memoryStorage({ [STORAGE_KEY]: bad })).recovered).toBe(true);
    expect(loadWorkspaceState(memoryStorage({ [STORAGE_KEY]: "null" })).recovered).toBe(true);
  });

  it("does not throw when storage is unavailable", () => {
    expect(loadWorkspaceState(null)).toEqual({ state: createSampleWorkspace(), recovered: false });
    expect(saveWorkspaceState(createEmptyWorkspace(), null)).toBe(false);
  });

  it("does not throw when reads fail", () => {
    const s = { ...memoryStorage(), getItem: throwing };
    expect(loadWorkspaceState(s).state).toEqual(createSampleWorkspace());
  });

  it("returns false when the quota is exceeded", () => {
    const s = { ...memoryStorage(), setItem: throwing };
    expect(saveWorkspaceState(createEmptyWorkspace(), s)).toBe(false);
  });

  it("defaults to window.localStorage and survives it being inaccessible", () => {
    const state = { ...createEmptyWorkspace(), jobDescription: "jd" };
    expect(saveWorkspaceState(state)).toBe(true);
    expect(loadWorkspaceState().state.jobDescription).toBe("jd");
    localStorage.clear();
    vi.spyOn(globalThis, "localStorage", "get").mockImplementation(throwing);
    try {
      expect(loadWorkspaceState().recovered).toBe(false);
      expect(saveWorkspaceState(state)).toBe(false);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
