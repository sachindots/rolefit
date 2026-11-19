import { LIMITS, createId, moveItem } from "../../lib/schema";
import type { EducationItem, SkillGroup } from "../../types/resume";
import { ListField, RowControls, SectionCard, TextField, removeAt, replaceAt } from "./SectionCard";

interface SkillsProps {
  items: SkillGroup[];
  onChange: (items: SkillGroup[]) => void;
}

export function SkillsEditor({ items, onChange }: SkillsProps) {
  const add = () => onChange([...items, { id: createId(), category: "", items: [] }]);
  return (
    <SectionCard title="Skills" count={items.length} action={{ label: "Add skill group", onClick: add, disabled: items.length >= LIMITS.skills }}>
      {items.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No skill groups yet.</p>}
      {items.map((item, i) => {
        const label = `skill group ${i + 1}`;
        const patch = (p: Partial<SkillGroup>) => onChange(replaceAt(items, i, p));
        return (
          <article key={item.id} className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-800 dark:bg-slate-950/40" aria-label={`Skill group ${i + 1}`}>
            <div className="flex items-start gap-2">
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                <TextField label={`Category (${label})`} value={item.category} onChange={(category) => patch({ category })} />
                <div className="sm:col-span-2">
                  <ListField label={`Skills (${label})`} value={item.items} onChange={(skills) => patch({ items: skills })} />
                </div>
              </div>
              <RowControls label={label} index={i} count={items.length} onMove={(a, b) => onChange(moveItem(items, a, b))} onRemove={() => onChange(removeAt(items, i))} />
            </div>
          </article>
        );
      })}
    </SectionCard>
  );
}

interface EducationProps {
  items: EducationItem[];
  onChange: (items: EducationItem[]) => void;
}

export function EducationEditor({ items, onChange }: EducationProps) {
  const add = () => onChange([...items, { id: createId(), institution: "", degree: "", location: "", startDate: "", endDate: "", details: "" }]);
  return (
    <SectionCard title="Education" count={items.length} action={{ label: "Add education", onClick: add, disabled: items.length >= LIMITS.education }}>
      {items.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No education yet.</p>}
      {items.map((item, i) => {
        const label = `education ${i + 1}`;
        const patch = (p: Partial<EducationItem>) => onChange(replaceAt(items, i, p));
        return (
          <article key={item.id} className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-800 dark:bg-slate-950/40" aria-label={`Education ${i + 1}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{item.institution || `Education ${i + 1}`}</h3>
              <RowControls label={label} index={i} count={items.length} onMove={(a, b) => onChange(moveItem(items, a, b))} onRemove={() => onChange(removeAt(items, i))} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField label={`Institution (${label})`} value={item.institution} onChange={(institution) => patch({ institution })} />
              <TextField label={`Degree (${label})`} value={item.degree} onChange={(degree) => patch({ degree })} />
              <TextField label={`Location (${label})`} value={item.location} onChange={(location) => patch({ location })} />
              <div className="grid grid-cols-2 gap-3">
                <TextField label={`Start date (${label})`} value={item.startDate} onChange={(startDate) => patch({ startDate })} />
                <TextField label={`End date (${label})`} value={item.endDate} onChange={(endDate) => patch({ endDate })} />
              </div>
            </div>
            <TextField label={`Details / GPA (${label})`} value={item.details} multiline rows={2} maxLength={LIMITS.details} onChange={(details) => patch({ details })} />
          </article>
        );
      })}
    </SectionCard>
  );
}
