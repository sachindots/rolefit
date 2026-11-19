import { Eye, FileEdit, Printer, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { ResumeEditor } from "./components/editor/ResumeEditor";
import { ResumePreview } from "./components/preview/ResumePreview";
import { PAGE_SIZE_LIST, TEMPLATE_LIST } from "./components/preview/templates";
import { validateWorkspaceState } from "./lib/schema";
import { loadWorkspaceState, saveWorkspaceState } from "./lib/storage";
import type { PageSize, ResumeData, TemplateId, WorkspaceState } from "./types/resume";

type WorkspaceTab = "editor" | "preview";

export default function App() {
  const [initial] = useState(loadWorkspaceState);
  const [workspace, setWorkspace] = useState<WorkspaceState>(initial.state);
  const [saveFailed, setSaveFailed] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("editor");

  const updateWorkspace = (next: WorkspaceState) => {
    setWorkspace(next);
    if (validateWorkspaceState(next).ok) setSaveFailed(!saveWorkspaceState(next));
  };

  const updateResume = (resume: ResumeData) => updateWorkspace({ ...workspace, resume });
  const updateTemplate = (template: TemplateId) => updateWorkspace({ ...workspace, template });
  const updatePageSize = (pageSize: PageSize) => updateWorkspace({ ...workspace, pageSize });

  const handleExportPdf = () => {
    if (typeof window.print === "function") window.print();
  };

  return (
    <div className="print-reset min-h-screen overflow-x-hidden bg-slate-50 text-slate-900">
      <header className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
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
      <main className="print-reset mx-auto max-w-7xl px-4 py-4 lg:py-5">
        {initial.recovered && (
          <p
            role="status"
            className="no-print mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            Saved data was unreadable, so the sample resume was loaded.
          </p>
        )}
        {saveFailed && (
          <p
            role="alert"
            className="no-print mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            Browser storage is unavailable. Changes will be lost on reload.
          </p>
        )}

        <div
          role="tablist"
          aria-label="Workspace view"
          className="no-print mb-4 grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-xs lg:hidden"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "editor"}
            aria-controls="workspace-editor-pane"
            onClick={() => setActiveTab("editor")}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
              activeTab === "editor" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <FileEdit className="h-3.5 w-3.5" aria-hidden />
            Editor
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "preview"}
            aria-controls="workspace-preview-pane"
            onClick={() => setActiveTab("preview")}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
              activeTab === "preview" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden />
            Preview
          </button>
        </div>

        <div className="print-reset grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          <section
            id="workspace-editor-pane"
            aria-label="Resume editor"
            className={`no-print min-w-0 ${
              activeTab === "editor" ? "block" : "hidden"
            } lg:block lg:max-h-[calc(100vh-5.5rem)] lg:overflow-y-auto lg:pr-1`}
          >
            <ResumeEditor resume={workspace.resume} onChange={updateResume} />
          </section>

          <section
            id="workspace-preview-pane"
            aria-label="Resume preview"
            className={`print-reset min-w-0 ${
              activeTab === "preview" ? "block" : "hidden"
            } lg:block lg:max-h-[calc(100vh-5.5rem)] lg:overflow-y-auto lg:pl-1`}
          >
            <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-xs">
              <div
                role="group"
                aria-label="Resume template"
                className="inline-flex flex-wrap rounded-md border border-slate-200 bg-slate-100 p-0.5"
              >
                {TEMPLATE_LIST.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={workspace.template === t.id}
                    onClick={() => updateTemplate(t.id)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
                      workspace.template === t.id
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div
                  role="group"
                  aria-label="Page size"
                  className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5"
                >
                  {PAGE_SIZE_LIST.map((size) => (
                    <button
                      key={size.id}
                      type="button"
                      aria-pressed={workspace.pageSize === size.id}
                      title={`${size.label} (${size.dimensions})`}
                      onClick={() => updatePageSize(size.id)}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
                        workspace.pageSize === size.id
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {size.shortLabel}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  <Printer className="h-3.5 w-3.5" aria-hidden />
                  Export PDF
                </button>
              </div>
            </div>

            <div className="print-reset rounded-lg border border-slate-200/80 bg-slate-200/70 p-3 sm:p-5">
              <ResumePreview
                resume={workspace.resume}
                template={workspace.template}
                pageSize={workspace.pageSize}
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
