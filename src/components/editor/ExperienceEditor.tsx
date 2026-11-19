import { Sparkles } from "lucide-react";
import { LIMITS, createId, moveItem } from "../../lib/schema";
import type { ExperienceItem } from "../../types/resume";
import { BulletsEditor, RowControls, SectionCard, TextField, removeAt, replaceAt } from "./SectionCard";

interface Props {
  items: ExperienceItem[];
  onChange: (items: ExperienceItem[]) => void;
  onTailorItem?: (item: ExperienceItem) => void;
}

const tailorButtonClass =
  "inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50/70 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:border-indigo-800/80 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/60";

export function ExperienceEditor({ items, onChange, onTailorItem }: Props) {
  const add = () =>
    onChange([...items, { id: createId(), company: "", role: "", location: "", startDate: "", endDate: "", bullets: [] }]);
  return (
    <SectionCard title="Experience" count={items.length} action={{ label: "Add role", onClick: add, disabled: items.length >= LIMITS.experience }}>
      {items.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No roles yet.</p>}
      {items.map((item, i) => {
        const label = `role ${i + 1}`;
        const patch = (p: Partial<ExperienceItem>) => onChange(replaceAt(items, i, p));
        return (
          <article key={item.id} className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-800 dark:bg-slate-950/40" aria-label={`Role ${i + 1}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{item.role || item.company || `Role ${i + 1}`}</h3>
              <div className="flex items-center gap-1.5">
                {onTailorItem && (
                  <button
                    type="button"
                    data-testid={`tailor-experience-${i + 1}-button`}
                    onClick={() => onTailorItem(item)}
                    className={tailorButtonClass}
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    Tailor with AI
                  </button>
                )}
                <RowControls label={label} index={i} count={items.length} onMove={(a, b) => onChange(moveItem(items, a, b))} onRemove={() => onChange(removeAt(items, i))} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField label={`Company (${label})`} value={item.company} onChange={(company) => patch({ company })} />
              <TextField label={`Role (${label})`} value={item.role} onChange={(role) => patch({ role })} />
              <TextField label={`Location (${label})`} value={item.location} onChange={(location) => patch({ location })} />
              <div className="grid grid-cols-2 gap-3">
                <TextField label={`Start date (${label})`} value={item.startDate} onChange={(startDate) => patch({ startDate })} />
                <TextField label={`End date (${label})`} value={item.endDate} onChange={(endDate) => patch({ endDate })} />
              </div>
            </div>
            <BulletsEditor scope={label} bullets={item.bullets} onChange={(bullets) => patch({ bullets })} />
          </article>
        );
      })}
    </SectionCard>
  );
}
