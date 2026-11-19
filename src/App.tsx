import { AlertCircle, CheckCircle2, Eye, FileEdit, Printer, Target, X } from "lucide-react";
import { useEffect, useState } from "react";
import { StudioHeader } from "./components/StudioHeader";
import { AiSettingsModal } from "./components/ai/AiSettingsModal";
import { AiTailorModal } from "./components/ai/AiTailorModal";
import { ResumeEditor } from "./components/editor/ResumeEditor";
import { JdMatchPanel } from "./components/match/JdMatchPanel";
import { ResumePreview } from "./components/preview/ResumePreview";
import { PAGE_SIZE_LIST, TEMPLATE_LIST } from "./components/preview/templates";
import { createSampleWorkspace } from "./data/sampleWorkspace";
import type { RewriteTarget } from "./lib/aiRewrite";
import {
  clearAiSettings,
  loadAiSettings,
  saveAiSettings,
  type AiSettings,
  type GeminiModelId,
  type KeyStorageMode,
} from "./lib/aiSettings";
import { auditResume } from "./lib/atsAudit";
import { downloadBackupFile, importBackupJson } from "./lib/backup";
import { analyzeJobDescription } from "./lib/jdEngine";
import { createEmptyWorkspace, validateWorkspaceState } from "./lib/schema";
import { loadWorkspaceState, saveWorkspaceState } from "./lib/storage";
import type {
  ExperienceItem,
  PageSize,
  ProjectItem,
  ResumeData,
  SkillGroup,
  TemplateId,
  ThemeMode,
  WorkspaceState,
} from "./types/resume";

type WorkspaceTab = "editor" | "match" | "preview";

interface StudioBanner {
  kind: "success" | "warning" | "error";
  message: string;
}

export default function App() {
  const [initial] = useState(loadWorkspaceState);
  const [workspace, setWorkspace] = useState<WorkspaceState>(initial.state);
  const [saveFailed, setSaveFailed] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("editor");
  const [banner, setBanner] = useState<StudioBanner | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings>(loadAiSettings);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [tailorTarget, setTailorTarget] = useState<RewriteTarget | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", workspace.theme === "dark");
  }, [workspace.theme]);

  const updateWorkspace = (next: WorkspaceState) => {
    setWorkspace(next);
    if (validateWorkspaceState(next).ok) setSaveFailed(!saveWorkspaceState(next));
  };

  const updateResume = (resume: ResumeData) => updateWorkspace({ ...workspace, resume });
  const updateJobDescription = (jobDescription: string) => updateWorkspace({ ...workspace, jobDescription });
  const updateTemplate = (template: TemplateId) => updateWorkspace({ ...workspace, template });
  const updatePageSize = (pageSize: PageSize) => updateWorkspace({ ...workspace, pageSize });
  const toggleTheme = () => {
    const nextTheme: ThemeMode = workspace.theme === "dark" ? "light" : "dark";
    updateWorkspace({ ...workspace, theme: nextTheme });
  };

  const handleLoadSample = () => {
    const sample = createSampleWorkspace();
    updateWorkspace({
      ...sample,
      theme: workspace.theme,
      template: workspace.template,
      pageSize: workspace.pageSize,
    });
    setBanner({ kind: "success", message: "Sample workspace loaded." });
  };

  const handleStartBlank = () => {
    const empty = createEmptyWorkspace();
    updateWorkspace({
      ...empty,
      theme: workspace.theme,
      template: workspace.template,
      pageSize: workspace.pageSize,
    });
    setBanner({ kind: "success", message: "Blank workspace ready." });
  };

  const handleExportBackup = () => {
    downloadBackupFile(workspace);
  };

  const handleImportBackupText = (rawText: string) => {
    const result = importBackupJson(rawText);
    if (!result.ok) {
      setBanner({ kind: "error", message: result.error });
      return;
    }
    updateWorkspace(result.state);
    if (result.warnings.length > 0) {
      setBanner({
        kind: "warning",
        message: `Backup imported with warnings: ${result.warnings.join(" ")}`,
      });
    } else {
      setBanner({ kind: "success", message: "Backup imported successfully." });
    }
  };

  const handleImportBackupError = (message: string) => {
    setBanner({ kind: "error", message });
  };

  const handleExportPdf = () => {
    if (typeof window.print === "function") window.print();
  };

  const handleSaveAiSettings = (input: {
    apiKey: string;
    model: GeminiModelId;
    storageMode: KeyStorageMode;
  }) => {
    const res = saveAiSettings(input);
    if (res.ok) {
      setAiSettings(loadAiSettings());
      setBanner({ kind: "success", message: "Gemini AI settings saved." });
    }
    return res;
  };

  const handleClearAiSettings = () => {
    clearAiSettings();
    setAiSettings(loadAiSettings());
    setBanner({ kind: "success", message: "Gemini API key cleared." });
  };

  const handleAcceptSummaryRewrite = (summary: string) => {
    updateResume({ ...workspace.resume, summary });
    setBanner({ kind: "success", message: "Tailored summary applied." });
  };

  const handleAcceptExperienceRewrite = (updated: ExperienceItem) => {
    updateResume({
      ...workspace.resume,
      experience: workspace.resume.experience.map((item) =>
        item.id === updated.id ? updated : item,
      ),
    });
    setBanner({ kind: "success", message: "Tailored experience bullets applied." });
  };

  const handleAcceptProjectRewrite = (updated: ProjectItem) => {
    updateResume({
      ...workspace.resume,
      projects: workspace.resume.projects.map((item) =>
        item.id === updated.id ? updated : item,
      ),
    });
    setBanner({ kind: "success", message: "Tailored project applied." });
  };

  const handleAcceptSkillsRewrite = (skills: SkillGroup[]) => {
    updateResume({ ...workspace.resume, skills });
    setBanner({ kind: "success", message: "Tailored skills applied." });
  };

  const aiActive = aiSettings.source !== "none" && Boolean(aiSettings.apiKey);
  const matchResult = analyzeJobDescription(workspace.resume, workspace.jobDescription);
  const auditResult = auditResume(workspace.resume);

  return (
    <div
      data-testid="studio-root"
      data-theme={workspace.theme}
      className={`${
        workspace.theme === "dark" ? "dark " : ""
      }print-reset min-h-screen overflow-x-hidden bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100`}
    >
      <StudioHeader
        theme={workspace.theme}
        aiActive={aiActive}
        onToggleTheme={toggleTheme}
        onOpenAiSettings={() => setAiSettingsOpen(true)}
        onLoadSample={handleLoadSample}
        onStartBlank={handleStartBlank}
        onExportBackup={handleExportBackup}
        onImportBackupText={handleImportBackupText}
        onImportBackupError={handleImportBackupError}
      />

      <main className="print-reset mx-auto max-w-7xl px-4 py-4 lg:py-5">
        {initial.recovered && (
          <p
            role="status"
            className="no-print mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/80 dark:bg-amber-950/60 dark:text-amber-200"
          >
            Saved data was unreadable, so the sample resume was loaded.
          </p>
        )}
        {saveFailed && (
          <p
            role="alert"
            className="no-print mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800/80 dark:bg-red-950/60 dark:text-red-200"
          >
            Browser storage is unavailable. Changes will be lost on reload.
          </p>
        )}
        {banner && (
          <div
            role={banner.kind === "error" ? "alert" : "status"}
            data-testid="studio-banner"
            className={`no-print mb-4 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
              banner.kind === "error"
                ? "border-red-200 bg-red-50 text-red-800 dark:border-red-800/80 dark:bg-red-950/60 dark:text-red-200"
                : banner.kind === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/80 dark:bg-amber-950/60 dark:text-amber-200"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/80 dark:bg-emerald-950/60 dark:text-emerald-200"
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              {banner.kind === "error" ? (
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              )}
              <span className="min-w-0 break-words">{banner.message}</span>
            </div>
            <button
              type="button"
              aria-label="Dismiss notice"
              onClick={() => setBanner(null)}
              className="rounded p-1 opacity-75 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}

        <div className="print-reset grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start lg:gap-6">
          <div className="no-print min-w-0">
            <div
              role="tablist"
              aria-label="Workspace view"
              className="mb-3 grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-xs lg:grid-cols-2 dark:border-slate-800 dark:bg-slate-900"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "editor"}
                aria-controls="workspace-editor-pane"
                onClick={() => setActiveTab("editor")}
                className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
                  activeTab === "editor"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <FileEdit className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">Editor</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "match"}
                aria-controls="workspace-match-pane"
                onClick={() => setActiveTab("match")}
                className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
                  activeTab === "match"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <Target className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">JD Match &amp; Audit</span>
                <span
                  data-testid="tab-match-score"
                  className={`rounded-full px-1.5 py-0.2 text-[11px] font-bold ${
                    activeTab === "match"
                      ? "bg-white/20 text-white"
                      : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300"
                  }`}
                >
                  {matchResult.score}%
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "preview"}
                aria-controls="workspace-preview-pane"
                onClick={() => setActiveTab("preview")}
                className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 lg:hidden ${
                  activeTab === "preview"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">Preview</span>
              </button>
            </div>

            <section
              id="workspace-editor-pane"
              aria-label="Resume editor"
              className={`min-w-0 ${activeTab === "editor" ? "block" : "hidden"} ${
                activeTab === "preview" ? "lg:block" : ""
              } lg:max-h-[calc(100vh-9.5rem)] lg:overflow-y-auto lg:pr-1`}
            >
              <ResumeEditor
                resume={workspace.resume}
                onChange={updateResume}
                onTailorTarget={(target) => setTailorTarget(target)}
              />
            </section>

            <section
              id="workspace-match-pane"
              aria-label="JD match and ATS audit"
              className={`min-w-0 ${
                activeTab === "match" ? "block" : "hidden"
              } lg:max-h-[calc(100vh-9.5rem)] lg:overflow-y-auto lg:pr-1`}
            >
              <JdMatchPanel
                resume={workspace.resume}
                jobDescription={workspace.jobDescription}
                onJobDescriptionChange={updateJobDescription}
                matchResult={matchResult}
                auditResult={auditResult}
              />
            </section>
          </div>

          <section
            id="workspace-preview-pane"
            aria-label="Resume preview"
            className={`print-reset min-w-0 ${
              activeTab === "preview" ? "block" : "hidden"
            } lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pl-1`}
          >
            <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div
                role="group"
                aria-label="Resume template"
                className="inline-flex flex-wrap rounded-md border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800"
              >
                {TEMPLATE_LIST.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={workspace.template === t.id}
                    onClick={() => updateTemplate(t.id)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
                      workspace.template === t.id
                        ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
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
                  className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800"
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
                          ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100"
                          : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
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

            <div className="print-reset rounded-lg border border-slate-200/80 bg-slate-200/70 p-3 sm:p-5 dark:border-slate-800 dark:bg-slate-900/70">
              <ResumePreview
                resume={workspace.resume}
                template={workspace.template}
                pageSize={workspace.pageSize}
              />
            </div>
          </section>
        </div>
      </main>

      <AiSettingsModal
        open={aiSettingsOpen}
        settings={aiSettings}
        onClose={() => setAiSettingsOpen(false)}
        onSave={handleSaveAiSettings}
        onClear={handleClearAiSettings}
      />

      <AiTailorModal
        open={tailorTarget !== null}
        target={tailorTarget}
        resume={workspace.resume}
        jobDescription={workspace.jobDescription}
        matchResult={matchResult}
        auditResult={auditResult}
        settings={aiSettings}
        onClose={() => setTailorTarget(null)}
        onOpenSettings={() => setAiSettingsOpen(true)}
        onAcceptSummary={handleAcceptSummaryRewrite}
        onAcceptExperience={handleAcceptExperienceRewrite}
        onAcceptProject={handleAcceptProjectRewrite}
        onAcceptSkills={handleAcceptSkillsRewrite}
      />
    </div>
  );
}
