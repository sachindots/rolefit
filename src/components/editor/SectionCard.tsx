import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { LIMITS, createId, isSafeUrl, moveItem } from "../../lib/schema";
import type { BulletItem } from "../../types/resume";

const inputClass =
  "mt-1 block w-full min-w-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 aria-[invalid=true]:border-red-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30";
const iconButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700";
const textButtonClass =
  "inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";

export const replaceAt = <T,>(items: readonly T[], index: number, patch: Partial<T>): T[] =>
  items.map((item, i) => (i === index ? { ...item, ...patch } : item));

export const removeAt = <T,>(items: readonly T[], index: number): T[] => items.filter((_, i) => i !== index);

interface SectionCardProps {
  title: string;
  count?: number;
  action?: { label: string; onClick: () => void; disabled?: boolean };
  defaultOpen?: boolean;
  children: ReactNode;
}

export function SectionCard({ title, count, action, defaultOpen = true, children }: SectionCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label={title}>
      <header className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
        >
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${open ? "" : "-rotate-90"}`} aria-hidden />
          <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          {count !== undefined && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300" aria-label={`${count} items`}>
              {count}
            </span>
          )}
        </button>
        {action && (
          <button type="button" className={textButtonClass} onClick={action.onClick} disabled={action.disabled}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {action.label}
          </button>
        )}
      </header>
      <div id={panelId} hidden={!open} className="space-y-4 border-t border-slate-100 px-4 py-4 dark:border-slate-800">
        {children}
      </div>
    </section>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  multiline?: boolean;
  rows?: number;
  type?: string;
}

export function TextField({ label, value, onChange, maxLength = LIMITS.shortText, multiline, rows = 3, type = "text" }: FieldProps) {
  return (
    <label className="block min-w-0 text-xs font-medium text-slate-600 dark:text-slate-300">
      {label}
      {multiline ? (
        <textarea className={inputClass} rows={rows} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className={inputClass} type={type} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

/** Keeps a local draft and only commits values the schema accepts, so storage never holds an invalid URL. */
export function UrlField({ label, value, onChange }: Pick<FieldProps, "label" | "value" | "onChange">) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== draft) setDraft(value);
  }
  const hintId = useId();
  const valid = isSafeUrl(draft);
  return (
    <div className="min-w-0">
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
        {label}
        <input
          className={inputClass}
          type="url"
          value={draft}
          maxLength={LIMITS.url}
          aria-invalid={!valid}
          aria-describedby={valid ? undefined : hintId}
          onChange={(e) => {
            setDraft(e.target.value);
            if (isSafeUrl(e.target.value)) onChange(e.target.value);
          }}
        />
      </label>
      {!valid && (
        <p id={hintId} className="mt-1 text-xs text-red-600 dark:text-red-400">
          Enter a full http:// or https:// link. Not saved until valid.
        </p>
      )}
    </div>
  );
}

const parseList = (text: string): string[] =>
  text
    .split(",")
    .map((s) => s.trim().slice(0, LIMITS.shortText))
    .filter(Boolean)
    .slice(0, LIMITS.tags);

export function ListField({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string[]) => void }) {
  const [draft, setDraft] = useState(value.join(", "));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (parseList(draft).join("\n") !== value.join("\n")) setDraft(value.join(", "));
  }
  return (
    <label className="block min-w-0 text-xs font-medium text-slate-600 dark:text-slate-300">
      {label} (comma separated)
      <input
        className={inputClass}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(parseList(e.target.value));
        }}
      />
    </label>
  );
}

interface RowControlsProps {
  label: string;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
}

export function RowControls({ label, index, count, onMove, onRemove }: RowControlsProps) {
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" className={iconButtonClass} aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
        <ArrowUp className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        className={iconButtonClass}
        aria-label={`Move ${label} down`}
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
      >
        <ArrowDown className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" className={iconButtonClass} aria-label={`Remove ${label}`} onClick={onRemove}>
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

interface BulletsEditorProps {
  scope: string;
  bullets: BulletItem[];
  onChange: (bullets: BulletItem[]) => void;
}

export function BulletsEditor({ scope, bullets, onChange }: BulletsEditorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">Bullets</h3>
        <button
          type="button"
          className={textButtonClass}
          aria-label={`Add bullet to ${scope}`}
          disabled={bullets.length >= LIMITS.bullets}
          onClick={() => onChange([...bullets, { id: createId(), text: "" }])}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add bullet
        </button>
      </div>
      {bullets.map((bullet, i) => {
        const label = `${scope} bullet ${i + 1}`;
        return (
          <div key={bullet.id} className="flex items-start gap-2">
            <textarea
              className={`${inputClass} mt-0 flex-1`}
              rows={2}
              aria-label={label}
              value={bullet.text}
              maxLength={LIMITS.bullet}
              onChange={(e) => onChange(replaceAt(bullets, i, { text: e.target.value }))}
            />
            <RowControls label={label} index={i} count={bullets.length} onMove={(from, to) => onChange(moveItem(bullets, from, to))} onRemove={() => onChange(removeAt(bullets, i))} />
          </div>
        );
      })}
    </div>
  );
}
