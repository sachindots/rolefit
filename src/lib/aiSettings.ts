/// <reference types="vite/client" />

export type GeminiModelId = "gemini-2.5-flash" | "gemini-2.5-flash-lite" | "gemini-2.5-pro";
export type KeyStorageMode = "session" | "local";

export interface AiSettings {
  apiKey: string;
  model: GeminiModelId;
  storageMode: KeyStorageMode;
  source: "user" | "dev-env" | "none";
}

export interface BuildEnv {
  dev: boolean;
  key?: string;
}

export const AI_STORAGE_KEY = "rolefit.ai.v1";
export const GEMINI_MODELS: readonly GeminiModelId[] = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"];
export const DEFAULT_GEMINI_MODEL: GeminiModelId = "gemini-2.5-flash";

const API_KEY_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;

export const isGeminiModelId = (value: unknown): value is GeminiModelId => GEMINI_MODELS.some((m) => m === value);
export const isValidApiKey = (value: string): boolean => API_KEY_PATTERN.test(value);

/** The ternary must stay literal so production builds fold it away and never inline the key. */
function readBuildEnv(): BuildEnv {
  return { dev: import.meta.env.DEV === true, key: import.meta.env.DEV ? import.meta.env.VITE_GEMINI_API_KEY : undefined };
}

function browserStorage(kind: "sessionStorage" | "localStorage"): Storage | null {
  try {
    return globalThis[kind] ?? null;
  } catch {
    return null;
  }
}

export interface AiStorages {
  session: Storage | null;
  local: Storage | null;
}

const defaultStorages = (): AiStorages => ({ session: browserStorage("sessionStorage"), local: browserStorage("localStorage") });

function readRecord(storage: Storage | null): { apiKey: string; model: GeminiModelId } | null {
  try {
    const raw = storage?.getItem(AI_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { apiKey, model } = parsed as Record<string, unknown>;
    if (typeof apiKey !== "string" || !isValidApiKey(apiKey)) return null;
    return { apiKey, model: isGeminiModelId(model) ? model : DEFAULT_GEMINI_MODEL };
  } catch {
    return null;
  }
}

export function loadAiSettings(storages: AiStorages = defaultStorages(), env: BuildEnv = readBuildEnv()): AiSettings {
  const fromSession = readRecord(storages.session);
  const fromLocal = fromSession ? null : readRecord(storages.local);
  const stored = fromSession ?? fromLocal;
  if (stored) {
    return { ...stored, storageMode: fromSession ? "session" : "local", source: "user" };
  }
  if (env.dev && env.key && isValidApiKey(env.key)) {
    return { apiKey: env.key, model: DEFAULT_GEMINI_MODEL, storageMode: "session", source: "dev-env" };
  }
  return { apiKey: "", model: DEFAULT_GEMINI_MODEL, storageMode: "session", source: "none" };
}

export type SaveAiSettingsResult = { ok: true } | { ok: false; error: string };

/** Writes the key to exactly one storage; the other is cleared so a key never lingers in localStorage by accident. */
export function saveAiSettings(
  input: { apiKey: string; model: GeminiModelId; storageMode: KeyStorageMode },
  storages: AiStorages = defaultStorages(),
): SaveAiSettingsResult {
  const apiKey = input.apiKey.trim();
  if (!isValidApiKey(apiKey)) return { ok: false, error: "That does not look like a Gemini API key." };
  if (!isGeminiModelId(input.model)) return { ok: false, error: "Unknown Gemini model." };
  const target = input.storageMode === "local" ? storages.local : storages.session;
  const other = input.storageMode === "local" ? storages.session : storages.local;
  if (!target) return { ok: false, error: "Browser storage is unavailable." };
  try {
    target.setItem(AI_STORAGE_KEY, JSON.stringify({ apiKey, model: input.model }));
  } catch {
    return { ok: false, error: "Could not save the key: browser storage is full or blocked." };
  }
  try {
    other?.removeItem(AI_STORAGE_KEY);
  } catch {
    // the other storage being unavailable leaves nothing to clear
  }
  return { ok: true };
}

export function clearAiSettings(storages: AiStorages = defaultStorages()): void {
  for (const storage of [storages.session, storages.local]) {
    try {
      storage?.removeItem(AI_STORAGE_KEY);
    } catch {
      // nothing stored if storage is unavailable
    }
  }
}
