import type { WorkspaceState } from "../types/resume";
import { isSafeUrl, validateWorkspaceState } from "./schema";

export const BACKUP_SCHEMA_VERSION = 1;
export const MAX_BACKUP_BYTES = 512 * 1024;
const MAX_DEPTH = 10;
const MAX_ERROR_DETAILS = 3;

export type BackupImportResult =
  | { ok: true; state: WorkspaceState; warnings: string[] }
  | { ok: false; error: string };

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const URL_KEYS = new Set(["website", "linkedin", "github", "link"]);
const MULTILINE_KEYS = new Set(["summary", "jobDescription", "details", "description"]);

const BLOCK_TAGS = /<\s*(script|style|iframe|object|embed|noscript|template)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const ANY_TAG = /<\/?[a-z!?][^>]*>/gi;
const STRAY_OPEN = /<(?=[a-z/!?])/gi;
const EVENT_HANDLER = /\bon[a-z]{3,}\s*=/gi;
const CONTROL_MULTILINE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const CONTROL_ALL = /[\u0000-\u001F\u007F]/g;
const URL_UNSAFE_CHARS = /[<>"'`\s]/;

class RejectError extends Error {}

export function serializeBackup(state: WorkspaceState): string {
  const { resume, jobDescription, template, pageSize, theme } = state;
  return JSON.stringify(
    {
      app: "rolefit",
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      workspace: { resume, jobDescription, template, pageSize, theme },
    },
    null,
    2,
  );
}

export function buildBackupFilename(fullName: string): string {
  const slug = fullName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug ? `rolefit-${slug}-backup.json` : "rolefit-backup.json";
}

export function downloadBackupFile(state: WorkspaceState): void {
  const blob = new Blob([serializeBackup(state)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = buildBackupFilename(state.resume.contact.fullName);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function stripHtml(text: string): string {
  let current = text;
  for (;;) {
    const next = current.replace(BLOCK_TAGS, "").replace(ANY_TAG, "");
    if (next === current) break;
    current = next;
  }
  return current.replace(STRAY_OPEN, "").replace(EVENT_HANDLER, "");
}

function sanitizeString(value: string, key: string, warnings: Set<string>): string {
  if (URL_KEYS.has(key)) {
    const cleaned = value.replace(CONTROL_ALL, "").trim();
    if (cleaned !== "" && (URL_UNSAFE_CHARS.test(cleaned) || !isSafeUrl(cleaned))) {
      warnings.add("Removed unsafe link(s): only http, https and mailto URLs are allowed.");
      return "";
    }
    if (cleaned !== value) warnings.add("Removed control characters or whitespace from some fields.");
    return cleaned;
  }
  let out = value;
  if (MULTILINE_KEYS.has(key)) out = out.replace(/\r\n?/g, "\n").replace(CONTROL_MULTILINE, "");
  else out = out.replace(CONTROL_ALL, "");
  if (out !== value) warnings.add("Removed control characters or line breaks from some fields.");
  const stripped = stripHtml(out);
  if (stripped !== out) warnings.add("Removed HTML or script content from some fields.");
  return stripped;
}

function sanitizeTree(value: unknown, key: string, depth: number, warnings: Set<string>): unknown {
  if (depth > MAX_DEPTH) throw new RejectError(`Backup is nested deeper than ${MAX_DEPTH} levels.`);
  if (typeof value === "string") return sanitizeString(value, key, warnings);
  if (Array.isArray(value)) return value.map((item) => sanitizeTree(item, key, depth + 1, warnings));
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(k)) throw new RejectError(`Backup contains a forbidden key "${k}".`);
      out[k] = sanitizeTree(v, k, depth + 1, warnings);
    }
    return out;
  }
  return value;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function extractWorkspace(parsed: unknown): unknown {
  if (!isRecord(parsed)) throw new RejectError("Backup must be a JSON object.");
  if ("workspace" in parsed) {
    if (parsed.app !== undefined && parsed.app !== "rolefit") throw new RejectError("This file is not a RoleFit backup.");
    if (parsed.schemaVersion !== BACKUP_SCHEMA_VERSION) {
      throw new RejectError(`Unsupported backup schemaVersion: expected ${BACKUP_SCHEMA_VERSION}.`);
    }
    if (!isRecord(parsed.workspace)) throw new RejectError("Backup workspace must be an object.");
    return { ...parsed.workspace, schemaVersion: BACKUP_SCHEMA_VERSION };
  }
  if (parsed.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new RejectError(`Unsupported backup schemaVersion: expected ${BACKUP_SCHEMA_VERSION}.`);
  }
  return parsed;
}

export function importBackupJson(rawText: string): BackupImportResult {
  try {
    if (typeof rawText !== "string" || rawText.trim() === "") throw new RejectError("Backup file is empty.");
    if (new TextEncoder().encode(rawText).byteLength > MAX_BACKUP_BYTES) {
      throw new RejectError(`Backup is larger than ${MAX_BACKUP_BYTES / 1024} KB.`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText.replace(/^\uFEFF/, ""));
    } catch {
      throw new RejectError("Backup is not valid JSON.");
    }
    const warnings = new Set<string>();
    const clean = sanitizeTree(extractWorkspace(parsed), "", 0, warnings);
    const result = validateWorkspaceState(clean);
    if (!result.ok) {
      throw new RejectError(`Backup is invalid: ${result.errors.slice(0, MAX_ERROR_DETAILS).join("; ")}`);
    }
    return { ok: true, state: result.value, warnings: [...warnings] };
  } catch (e) {
    return { ok: false, error: e instanceof RejectError ? e.message : "Backup could not be read." };
  }
}
