import type { PageSize, TemplateId } from "../../types/resume";

export interface TemplateStyles {
  sheet: string;
  header: string;
  headerTop: string;
  name: string;
  headline: string;
  contactList: string;
  link: string;
  body: string;
  section: string;
  sectionHeading: string;
  summary: string;
  entryList: string;
  entry: string;
  entryPrimaryRow: string;
  entrySecondaryRow: string;
  entryTitle: string;
  entrySubtitle: string;
  entryMeta: string;
  entryDescription: string;
  techList: string;
  bulletList: string;
  bulletItem: string;
  skillList: string;
  skillRow: string;
  skillCategory: string;
  compactEntry: boolean;
}

export interface TemplateDefinition {
  id: TemplateId;
  label: string;
  description: string;
  styles: TemplateStyles;
}

export interface PageSizeDefinition {
  id: PageSize;
  label: string;
  shortLabel: string;
  dimensions: string;
}

export const TEMPLATES: Record<TemplateId, TemplateDefinition> = {
  "classic-executive": {
    id: "classic-executive",
    label: "Classic Executive",
    description: "Traditional serif typography, centered header, and crisp section rules.",
    styles: {
      sheet: "font-serif px-7 py-8 sm:px-10 sm:py-10 text-[13px] leading-relaxed text-slate-900",
      header: "mb-5 border-b-2 border-slate-900 pb-3.5 text-center",
      headerTop: "space-y-1",
      name: "text-2xl font-bold tracking-wide text-slate-950",
      headline: "text-sm italic text-slate-700",
      contactList: "mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-700",
      link: "text-slate-800 underline decoration-slate-400 underline-offset-2 hover:text-slate-950",
      body: "space-y-4",
      section: "space-y-2",
      sectionHeading:
        "border-b border-slate-900 pb-0.5 text-xs font-bold uppercase tracking-[0.16em] text-slate-950",
      summary: "text-[13px] leading-relaxed text-slate-800",
      entryList: "space-y-3",
      entry: "space-y-1",
      entryPrimaryRow: "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5",
      entrySecondaryRow: "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs italic text-slate-700",
      entryTitle: "text-sm font-bold text-slate-950",
      entrySubtitle: "font-medium text-slate-800",
      entryMeta: "shrink-0 text-xs text-slate-700",
      entryDescription: "text-xs leading-relaxed text-slate-800",
      techList: "text-xs italic text-slate-700",
      bulletList: "list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-slate-800",
      bulletItem: "pl-0.5",
      skillList: "space-y-1 text-[13px] text-slate-800",
      skillRow: "leading-relaxed",
      skillCategory: "font-bold text-slate-950",
      compactEntry: false,
    },
  },
  "modern-minimal": {
    id: "modern-minimal",
    label: "Modern Minimal",
    description: "Clean sans-serif hierarchy, subtle accent rule, and open readable rhythm.",
    styles: {
      sheet: "font-sans px-7 py-8 sm:px-10 sm:py-10 text-[13px] leading-relaxed text-slate-900",
      header: "mb-5 border-b border-slate-200 pb-4 text-left",
      headerTop: "space-y-0.5",
      name: "text-2xl font-semibold tracking-tight text-slate-950",
      headline: "text-sm font-medium text-indigo-700",
      contactList: "mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600",
      link: "text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900",
      body: "space-y-5",
      section: "space-y-2.5",
      sectionHeading:
        "border-b border-slate-200 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-700",
      summary: "text-[13px] leading-relaxed text-slate-700",
      entryList: "space-y-3.5",
      entry: "space-y-1",
      entryPrimaryRow: "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5",
      entrySecondaryRow: "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs text-slate-600",
      entryTitle: "text-sm font-semibold text-slate-900",
      entrySubtitle: "font-medium text-slate-700",
      entryMeta: "shrink-0 text-xs font-medium tabular-nums text-slate-500",
      entryDescription: "text-xs leading-relaxed text-slate-700",
      techList: "text-xs font-medium text-slate-600",
      bulletList: "list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-slate-700",
      bulletItem: "pl-0.5",
      skillList: "space-y-1.5 text-[13px] text-slate-700",
      skillRow: "leading-relaxed",
      skillCategory: "font-semibold text-slate-900",
      compactEntry: false,
    },
  },
  "technical-compact": {
    id: "technical-compact",
    label: "Technical Compact",
    description: "Dense engineering typography, single-line metadata headers, and tight bullet spacing.",
    styles: {
      sheet: "font-sans px-6 py-6 sm:px-8 sm:py-7 text-xs leading-snug text-slate-900",
      header: "mb-3.5 border-b border-slate-800 pb-2.5 text-left",
      headerTop: "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5",
      name: "text-xl font-bold tracking-tight text-slate-950",
      headline: "font-mono text-xs font-medium text-slate-700",
      contactList: "mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[11px] text-slate-700",
      link: "text-slate-900 underline decoration-slate-400 underline-offset-2 hover:text-indigo-700",
      body: "space-y-3",
      section: "space-y-1.5",
      sectionHeading:
        "border-b border-slate-300 pb-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-slate-900",
      summary: "text-xs leading-snug text-slate-800",
      entryList: "space-y-2",
      entry: "space-y-0.5",
      entryPrimaryRow: "flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5",
      entrySecondaryRow: "flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 font-mono text-[11px] text-slate-600",
      entryTitle: "text-xs font-bold text-slate-950",
      entrySubtitle: "text-xs font-medium text-slate-800",
      entryMeta: "shrink-0 font-mono text-[11px] tabular-nums text-slate-600",
      entryDescription: "text-xs leading-snug text-slate-800",
      techList: "font-mono text-[11px] text-slate-700",
      bulletList: "list-disc space-y-0.5 pl-4 text-xs leading-snug text-slate-800",
      bulletItem: "pl-0.5",
      skillList: "space-y-0.5 text-xs text-slate-800",
      skillRow: "leading-snug",
      skillCategory: "font-mono text-[11px] font-bold text-slate-950",
      compactEntry: true,
    },
  },
};

export const TEMPLATE_LIST: readonly TemplateDefinition[] = [
  TEMPLATES["classic-executive"],
  TEMPLATES["modern-minimal"],
  TEMPLATES["technical-compact"],
];

export const PAGE_SIZES: Record<PageSize, PageSizeDefinition> = {
  letter: {
    id: "letter",
    label: "US Letter",
    shortLabel: "Letter",
    dimensions: "8.5 × 11 in",
  },
  a4: {
    id: "a4",
    label: "A4",
    shortLabel: "A4",
    dimensions: "210 × 297 mm",
  },
};

export const PAGE_SIZE_LIST: readonly PageSizeDefinition[] = [PAGE_SIZES.letter, PAGE_SIZES.a4];
