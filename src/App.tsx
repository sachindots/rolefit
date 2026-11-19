import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { ResumeEditor } from "./components/editor/ResumeEditor";
import { validateWorkspaceState } from "./lib/schema";
import { loadWorkspaceState, saveWorkspaceState } from "./lib/storage";
import type { ResumeData, WorkspaceState } from "./types/resume";

export default function App() {
  const [initial] = useState(loadWorkspaceState);
  const [workspace, setWorkspace] = useState<WorkspaceState>(initial.state);
  const [saveFailed, setSaveFailed] = useState(false);

  const updateWorkspace = (next: WorkspaceState) => {
    setWorkspace(next);
    if (validateWorkspaceState(next).ok) setSaveFailed(!saveWorkspaceState(next));
  };

  const updateResume = (resume: ResumeData) => updateWorkspace({ ...workspace, resume });

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">RoleFit</h1>
            <p className="truncate text-xs text-slate-500">Private ATS Resume Builder &amp; JD Match Studio</p>
          </div>
          <p className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Local-only · Zero tracking
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {initial.recovered && (
          <p role="status" className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Saved data was unreadable, so the sample resume was loaded.
          </p>
        )}
        {saveFailed && (
          <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Browser storage is unavailable. Changes will be lost on reload.
          </p>
        )}
        <section aria-label="Resume editor" className="mx-auto max-w-3xl min-w-0">
          <ResumeEditor resume={workspace.resume} onChange={updateResume} />
        </section>
      </main>
    </div>
  );
}
