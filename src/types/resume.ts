export type TemplateId = "classic-executive" | "modern-minimal" | "technical-compact";
export type PageSize = "letter" | "a4";
export type ThemeMode = "light" | "dark";

export interface ContactInfo {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  linkedin: string;
  github: string;
}

export interface BulletItem {
  id: string;
  text: string;
}

export interface ExperienceItem {
  id: string;
  company: string;
  role: string;
  location: string;
  startDate: string;
  endDate: string;
  bullets: BulletItem[];
}

export interface ProjectItem {
  id: string;
  name: string;
  link: string;
  description: string;
  technologies: string[];
  bullets: BulletItem[];
}

export interface SkillGroup {
  id: string;
  category: string;
  items: string[];
}

export interface EducationItem {
  id: string;
  institution: string;
  degree: string;
  location: string;
  startDate: string;
  endDate: string;
  details: string;
}

export interface ResumeData {
  contact: ContactInfo;
  summary: string;
  experience: ExperienceItem[];
  projects: ProjectItem[];
  skills: SkillGroup[];
  education: EducationItem[];
}

export interface WorkspaceState {
  schemaVersion: 1;
  resume: ResumeData;
  jobDescription: string;
  template: TemplateId;
  pageSize: PageSize;
  theme: ThemeMode;
}
