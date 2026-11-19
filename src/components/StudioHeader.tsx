import { Download, FilePlus2, FileUp, Moon, RotateCcw, ShieldCheck, Sparkles, Sun, Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { MAX_BACKUP_BYTES } from "../lib/backup";
import type { ThemeMode } from "../types/resume";
import { ConfirmDialog } from "./ConfirmDialog";

export interface StudioHeaderProps {
  theme: ThemeMode;
  aiActive?: boolean;
  onToggleTheme: () => void;
  onOpenUploadResume?: () => void;
  onOpenAiSettings?: () => void;
  onLoadSample: () => void;
  onStartBlank: () => void;
  onExportBackup: () => void;
  onImportBackupText: (rawText: string) => void;
  onImportBackupError: (message: string) => void;
}

type PendingDialog = "sample" | "blank" | null;

const headerButtonClass =
  "inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";

function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Backup could not be read."));
    reader.readAsText(file);
  });
}

export function StudioHeader({
  theme,
  aiActive = false,
  onToggleTheme,
  onOpenUploadResume,
  onOpenAiSettings,
  onLoadSample,
  onStartBlank,
  onExportBackup,
  onImportBackupText,
  onImportBackupError,
}: StudioHeaderProps) {
  const [pendingDialog, setPendingDialog] = useState<PendingDialog>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > MAX_BACKUP_BYTES) {
      onImportBackupError(`Backup is larger than ${MAX_BACKUP_BYTES / 1024} KB.`);
      return;
    }

    try {
      const rawText = await readFileText(file);
      onImportBackupText(rawText);
    } catch {
      onImportBackupError("Backup could not be read.");
    }
  };

  const isDark = theme === "dark";

  return (
    <>
      <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2.5 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">RoleFit</h1>
                <p
                  data-testid="privacy-badge"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300"
                >
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  {aiActive ? "Local-first · AI via Gemini (on click)" : "Local-only · Zero tracking"}
                </p>
              </div>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                Private ATS Resume Builder &amp; JD Match Studio
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Workspace actions">
            {onOpenUploadResume && (
              <button
                type="button"
                onClick={onOpenUploadResume}
                data-testid="upload-resume-button"
                className={headerButtonClass}
              >
                <FileUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden />
                Upload Resume
              </button>
            )}

            <button type="button" onClick={() => setPendingDialog("sample")} className={headerButtonClass}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Load sample
            </button>

            <button type="button" onClick={() => setPendingDialog("blank")} className={headerButtonClass}>
              <FilePlus2 className="h-3.5 w-3.5" aria-hidden />
              Start blank
            </button>

            <button type="button" onClick={onExportBackup} className={headerButtonClass}>
              <Download className="h-3.5 w-3.5" aria-hidden />
              Export JSON
            </button>

            <button type="button" onClick={() => fileInputRef.current?.click()} className={headerButtonClass}>
              <Upload className="h-3.5 w-3.5" aria-hidden />
              Import JSON
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              aria-label="Import backup JSON file"
              data-testid="import-json-input"
              className="sr-only"
              onChange={handleFileChange}
            />

            {onOpenAiSettings && (
              <button
                type="button"
                onClick={onOpenAiSettings}
                data-testid="ai-settings-button"
                className={headerButtonClass}
              >
                <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden />
                AI Settings
              </button>
            )}

            <button
              type="button"
              onClick={onToggleTheme}
              aria-pressed={isDark}
              aria-label={isDark ? "Switch to light mode (dark mode active)" : "Switch to dark mode (light mode active)"}
              data-testid="theme-toggle"
              className={headerButtonClass}
            >
              {isDark ? (
                <>
                  <Sun className="h-3.5 w-3.5 text-amber-400" aria-hidden />
                  <span>Light mode</span>
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5 text-slate-600" aria-hidden />
                  <span>Dark mode</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <ConfirmDialog
        open={pendingDialog === "sample"}
        title="Load sample workspace?"
        description="This will replace your current resume and job description with the sample data. Export a JSON backup first if you want to keep your changes."
        confirmLabel="Load sample"
        onConfirm={() => {
          setPendingDialog(null);
          onLoadSample();
        }}
        onCancel={() => setPendingDialog(null)}
      />

      <ConfirmDialog
        open={pendingDialog === "blank"}
        title="Start blank workspace?"
        description="This will clear your current resume and job description so you can start from scratch. Export a JSON backup first if you want to keep your changes."
        confirmLabel="Start blank"
        variant="danger"
        onConfirm={() => {
          setPendingDialog(null);
          onStartBlank();
        }}
        onCancel={() => setPendingDialog(null)}
      />
    </>
  );
}
