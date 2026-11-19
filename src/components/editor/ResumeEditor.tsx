import { LIMITS } from "../../lib/schema";
import type { ContactInfo, ResumeData } from "../../types/resume";
import { ExperienceEditor } from "./ExperienceEditor";
import { ProjectsEditor } from "./ProjectsEditor";
import { SectionCard, TextField, UrlField } from "./SectionCard";
import { EducationEditor, SkillsEditor } from "./SkillsEducationEditor";

interface Props {
  resume: ResumeData;
  onChange: (resume: ResumeData) => void;
}

const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

export function ResumeEditor({ resume, onChange }: Props) {
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
        <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
          {wordCount(resume.summary)} words · {resume.summary.length}/{LIMITS.summary} characters
        </p>
      </SectionCard>
      <ExperienceEditor items={resume.experience} onChange={(experience) => onChange({ ...resume, experience })} />
      <ProjectsEditor items={resume.projects} onChange={(projects) => onChange({ ...resume, projects })} />
      <SkillsEditor items={resume.skills} onChange={(skills) => onChange({ ...resume, skills })} />
      <EducationEditor items={resume.education} onChange={(education) => onChange({ ...resume, education })} />
    </div>
  );
}
