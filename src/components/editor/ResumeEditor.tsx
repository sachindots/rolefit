import { Sparkles } from "lucide-react";
import type { RewriteTarget } from "../../lib/aiRewrite";
import { LIMITS } from "../../lib/schema";
import type { ContactInfo, ResumeData } from "../../types/resume";
import { ExperienceEditor } from "./ExperienceEditor";
import { ProjectsEditor } from "./ProjectsEditor";
import { SectionCard, TextField, UrlField } from "./SectionCard";
import { EducationEditor, SkillsEditor } from "./SkillsEducationEditor";

interface Props {
  resume: ResumeData;
  onChange: (resume: ResumeData) => void;
  onTailorTarget?: (target: RewriteTarget) => void;
}

const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

const tailorButtonClass =
  "inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:border-indigo-800/80 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/60";

export function ResumeEditor({ resume, onChange, onTailorTarget }: Props) {
  const { contact } = resume;
  const setContact = (patch: Partial<ContactInfo>) => onChange({ ...resume, contact: { ...contact, ...patch } });
  return (
    <div className="space-y-4">
      <SectionCard title="Contact">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label="Full name" value={contact.fullName} onChange={(fullName) => setContact({ fullName })} />
          <TextField label="Headline" value={contact.headline} onChange={(headline) => setContact({ headline })} />
          <TextField label="Email" type="email" value={contact.email} onChange={(email) => setContact({ email })} />
          <TextField label="Phone" type="tel" value={contact.phone} onChange={(phone) => setContact({ phone })} />
          <TextField label="Location" value={contact.location} onChange={(location) => setContact({ location })} />
          <UrlField label="Website" value={contact.website} onChange={(website) => setContact({ website })} />
          <UrlField label="LinkedIn" value={contact.linkedin} onChange={(linkedin) => setContact({ linkedin })} />
          <UrlField label="GitHub" value={contact.github} onChange={(github) => setContact({ github })} />
        </div>
      </SectionCard>
      <SectionCard title="Professional Summary">
        <TextField
          label="Summary"
          value={resume.summary}
          multiline
          rows={4}
          maxLength={LIMITS.summary}
          onChange={(summary) => onChange({ ...resume, summary })}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
            {wordCount(resume.summary)} words · {resume.summary.length}/{LIMITS.summary} characters
          </p>
          {onTailorTarget && (
            <button
              type="button"
              data-testid="tailor-summary-button"
              onClick={() => onTailorTarget({ kind: "summary", summary: resume.summary })}
              className={tailorButtonClass}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Tailor with AI
            </button>
          )}
        </div>
      </SectionCard>
      <ExperienceEditor
        items={resume.experience}
        onChange={(experience) => onChange({ ...resume, experience })}
        onTailorItem={
          onTailorTarget ? (item) => onTailorTarget({ kind: "experience", item }) : undefined
        }
      />
      <ProjectsEditor
        items={resume.projects}
        onChange={(projects) => onChange({ ...resume, projects })}
        onTailorItem={
          onTailorTarget ? (item) => onTailorTarget({ kind: "project", item }) : undefined
        }
      />
      <SkillsEditor
        items={resume.skills}
        onChange={(skills) => onChange({ ...resume, skills })}
        onTailorSkills={
          onTailorTarget ? (groups) => onTailorTarget({ kind: "skills", groups }) : undefined
        }
      />
      <EducationEditor items={resume.education} onChange={(education) => onChange({ ...resume, education })} />
    </div>
  );
}
