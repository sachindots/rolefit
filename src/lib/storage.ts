import { createSampleWorkspace } from "../data/sampleWorkspace";
import type { WorkspaceState } from "../types/resume";
import { validateWorkspaceState } from "./schema";

export const STORAGE_KEY = "rolefit.workspace.v1";

export interface LoadResult {
  state: WorkspaceState;
  recovered: boolean;
}

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadWorkspaceState(storage: Storage | null = defaultStorage()): LoadResult {
  let raw: string | null;
  try {
    raw = storage ? storage.getItem(STORAGE_KEY) : null;
  } catch {
    return { state: createSampleWorkspace(), recovered: false };
  }
  if (raw === null) return { state: createSampleWorkspace(), recovered: false };
  try {
    const result = validateWorkspaceState(JSON.parse(raw));
    if (result.ok) return { state: result.value, recovered: false };
  } catch {
    // corrupt JSON falls through to recovery
  }
  return { state: createSampleWorkspace(), recovered: true };
}

/** Returns false when storage is unavailable or full; never throws. */
export function saveWorkspaceState(state: WorkspaceState, storage: Storage | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
