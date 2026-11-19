import { LIMITS, createId, moveItem } from "../../lib/schema";
import type { ProjectItem } from "../../types/resume";
import { BulletsEditor, ListField, RowControls, SectionCard, TextField, UrlField, removeAt, replaceAt } from "./SectionCard";

interface Props {
  items: ProjectItem[];
  onChange: (items: ProjectItem[]) => void;
}

export function ProjectsEditor({ items, onChange }: Props) {
  const add = () => onChange([...items, { id: createId(), name: "", link: "", description: "", technologies: [], bullets: [] }]);
  return (
    <SectionCard title="Projects" count={items.length} action={{ label: "Add project", onClick: add, disabled: items.length >= LIMITS.projects }}>
      {items.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No projects yet.</p>}
      {items.map((item, i) => {
        const label = `project ${i + 1}`;
        const patch = (p: Partial<ProjectItem>) => onChange(replaceAt(items, i, p));
        return (
          <article key={item.id} className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-800 dark:bg-slate-950/40" aria-label={`Project ${i + 1}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{item.name || `Project ${i + 1}`}</h3>
              <RowControls label={label} index={i} count={items.length} onMove={(a, b) => onChange(moveItem(items, a, b))} onRemove={() => onChange(removeAt(items, i))} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField label={`Name (${label})`} value={item.name} onChange={(name) => patch({ name })} />
              <UrlField label={`Link (${label})`} value={item.link} onChange={(link) => patch({ link })} />
            </div>
            <ListField label={`Technologies (${label})`} value={item.technologies} onChange={(technologies) => patch({ technologies })} />
            <TextField label={`Description (${label})`} value={item.description} multiline rows={2} maxLength={LIMITS.details} onChange={(description) => patch({ description })} />
            <BulletsEditor scope={label} bullets={item.bullets} onChange={(bullets) => patch({ bullets })} />
          </article>
        );
      })}
    </SectionCard>
  );
}
