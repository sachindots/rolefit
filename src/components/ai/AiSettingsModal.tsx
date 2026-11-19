import { Eye, EyeOff, KeyRound, ShieldAlert, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODELS,
  type AiSettings,
  type GeminiModelId,
  type KeyStorageMode,
  type SaveAiSettingsResult,
} from "../../lib/aiSettings";

export interface AiSettingsModalProps {
  open: boolean;
  settings: AiSettings;
  onClose: () => void;
  onSave: (input: {
    apiKey: string;
    model: GeminiModelId;
    storageMode: KeyStorageMode;
  }) => SaveAiSettingsResult;
  onClear: () => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const MODEL_LABELS: Record<GeminiModelId, string> = {
  "gemini-2.5-flash": "Gemini 2.5 Flash (Recommended — balanced speed & quality)",
  "gemini-2.5-flash-lite": "Gemini 2.5 Flash-Lite (Fastest & lightweight)",
  "gemini-2.5-pro": "Gemini 2.5 Pro (Deepest reasoning)",
};

export function AiSettingsModal({
  open,
  settings,
  onClose,
  onSave,
  onClear,
}: AiSettingsModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Never prefill raw dev-env keys into the DOM.
  const initialKey = settings.source === "user" ? settings.apiKey : "";
  const [apiKey, setApiKey] = useState(initialKey);
  const [model, setModel] = useState<GeminiModelId>(settings.model || DEFAULT_GEMINI_MODEL);
  const [storageMode, setStorageMode] = useState<KeyStorageMode>(settings.storageMode || "session");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setApiKey(settings.source === "user" ? settings.apiKey : "");
    setModel(settings.model || DEFAULT_GEMINI_MODEL);
    setStorageMode(settings.storageMode || "session");
    setShowKey(false);
    setError(null);
  }, [open, settings.apiKey, settings.model, settings.source, settings.storageMode]);

  useEffect(() => {
    if (!open) return;

    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    keyInputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !dialogRef.current.contains(active)) {
          event.preventDefault();
          last?.focus();
        }
      } else if (active === last || !dialogRef.current.contains(active)) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [open]);

  if (!open) return null;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const result = onSave({ apiKey, model, storageMode });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
  };

  const handleClear = () => {
    onClear();
    setApiKey("");
    setShowKey(false);
    setError(null);
  };

  return (
    <div
      data-testid="ai-settings-backdrop"
      onClick={onClose}
      className="no-print fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <Sparkles className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <h2 id={titleId} className="text-base font-semibold text-slate-900 dark:text-slate-100">
                AI Settings (Gemini BYOK)
              </h2>
              <p
                id={descriptionId}
                className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300"
              >
                Bring your own Google Gemini API key for browser-direct section tailoring. Requests
                go directly to Google only when you click Generate Rewrite.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close AI settings"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {settings.source === "dev-env" && (
          <div
            role="status"
            data-testid="dev-env-active-notice"
            className="mt-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-xs text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-200"
          >
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Local dev key active (.env.local)</p>
              <p className="mt-0.5">
                Using <code className="font-mono">VITE_GEMINI_API_KEY</code> from your local
                development environment (hidden from the DOM). Save a key below only if you want to
                override it in this browser.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="gemini-api-key-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Gemini API key
            </label>
            <div className="relative mt-1 flex items-center">
              <KeyRound
                className="pointer-events-none absolute left-2.5 h-4 w-4 text-slate-400"
                aria-hidden
              />
              <input
                ref={keyInputRef}
                id="gemini-api-key-input"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={
                  settings.source === "dev-env"
                    ? "Using .env.local dev key (enter key to override)"
                    : "AIzaSy..."
                }
                autoComplete="off"
                spellCheck={false}
                className="block w-full rounded-md border border-slate-300 bg-white py-1.5 pr-9 pl-8 font-mono text-xs text-slate-900 shadow-2xs focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400"
              />
              <button
                type="button"
                aria-label={showKey ? "Hide API key" : "Show API key"}
                onClick={() => setShowKey((prev) => !prev)}
                className="absolute right-2 rounded p-1 text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:text-slate-400 dark:hover:text-slate-200"
              >
                {showKey ? (
                  <EyeOff className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Eye className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="gemini-model-select"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Gemini model
            </label>
            <select
              id="gemini-model-select"
              aria-label="Gemini model"
              value={model}
              onChange={(e) => setModel(e.target.value as GeminiModelId)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-2xs focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {GEMINI_MODELS.map((modelId) => (
                <option key={modelId} value={modelId}>
                  {MODEL_LABELS[modelId]}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Key storage preference
            </legend>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 text-xs hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60">
              <input
                type="radio"
                name="ai-storage-mode"
                value="session"
                checked={storageMode === "session"}
                onChange={() => setStorageMode("session")}
                className="mt-0.5"
              />
              <div>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  Session only — clears on tab close (Recommended)
                </span>
                <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                  Stored in <code className="font-mono">sessionStorage</code> and wiped when you
                  close this browser tab.
                </p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 text-xs hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60">
              <input
                type="radio"
                name="ai-storage-mode"
                value="local"
                checked={storageMode === "local"}
                onChange={() => setStorageMode("local")}
                className="mt-0.5"
              />
              <div>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  Remember on this device (localStorage)
                </span>
                <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                  Persists in browser <code className="font-mono">localStorage</code> on this
                  computer. Avoid on shared or public devices.
                </p>
              </div>
            </label>
          </fieldset>

          <div
            data-testid="ai-storage-notice"
            className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300"
          >
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden />
            <span>
              Your API key is never sent to RoleFit servers. When active, clicking{" "}
              <strong>Generate Rewrite</strong> sends the selected resume section and job
              description directly to <code className="font-mono">generativelanguage.googleapis.com</code>.
            </span>
          </div>

          {error && (
            <p
              role="alert"
              data-testid="ai-settings-error"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800/80 dark:bg-red-950/60 dark:text-red-300"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Clear key
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                Save key
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
