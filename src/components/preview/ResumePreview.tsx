import { isSafeUrl } from "../../lib/schema";
import type { PageSize, ResumeData, TemplateId } from "../../types/resume";
import { TEMPLATES, type TemplateStyles } from "./templates";

export interface ResumePreviewProps {
  resume: ResumeData;
  template: TemplateId;
  pageSize: PageSize;
}

const formatDateRange = (startDate: string, endDate: string): string => {
  const start = startDate.trim();
  const end = endDate.trim();
  if (start && end) return `${start} – ${end}`;
  return start || end;
};

const formatLinkLabel = (url: string): string =>
  url.replace(/^(?:https?:\/\/|mailto:)(?:www\.)?/i, "").replace(/\/$/, "");

const toSafeLink = (raw: string): string | null => {
  const trimmed = raw.trim();
  return trimmed !== "" && isSafeUrl(trimmed) ? trimmed : null;
};

interface EntryHeaderProps {
  primary: string;
  secondary: string;
  location: string;
  dateRange: string;
  styles: TemplateStyles;
}

function EntryHeader({ primary, secondary, location, dateRange, styles }: EntryHeaderProps) {
  const title = primary || secondary;
  const sub = primary && secondary ? secondary : "";
  if (styles.compactEntry) {
    return (
      <div className={styles.entryPrimaryRow}>
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <h3 className={styles.entryTitle}>{title}</h3>
          {sub && <span className={styles.entrySubtitle}>· {sub}</span>}
          {location && <span className={styles.entryMeta}>({location})</span>}
        </div>
        {dateRange && <span className={styles.entryMeta}>{dateRange}</span>}
      </div>
    );
  }
  return (
    <>
      <div className={styles.entryPrimaryRow}>
        <h3 className={styles.entryTitle}>{title}</h3>
        {dateRange && <span className={styles.entryMeta}>{dateRange}</span>}
      </div>
      {(sub || location) && (
        <div className={styles.entrySecondaryRow}>
          <span className={styles.entrySubtitle}>{sub}</span>
          {location && <span>{location}</span>}
        </div>
      )}
    </>
  );
}

export function ResumePreview({ resume, template, pageSize }: ResumePreviewProps) {
  const { styles } = TEMPLATES[template];
  const { contact } = resume;

  const fullName = contact.fullName.trim();
  const headline = contact.headline.trim();
  const contactTexts = [contact.email, contact.phone, contact.location].map((s) => s.trim()).filter(Boolean);
  const contactLinks = [contact.website, contact.linkedin, contact.github]
    .map(toSafeLink)
    .filter((link): link is string => link !== null);

  const summary = resume.summary.trim();

  const experienceEntries = resume.experience
    .map((item) => ({
      id: item.id,
      role: item.role.trim(),
      company: item.company.trim(),
      location: item.location.trim(),
      dateRange: formatDateRange(item.startDate, item.endDate),
      bullets: item.bullets.map((b) => ({ id: b.id, text: b.text.trim() })).filter((b) => b.text !== ""),
    }))
    .filter(
      (item) =>
        item.role !== "" ||
        item.company !== "" ||
        item.location !== "" ||
        item.dateRange !== "" ||
        item.bullets.length > 0,
    );

  const projectEntries = resume.projects
    .map((item) => ({
      id: item.id,
      name: item.name.trim(),
      safeLink: toSafeLink(item.link),
      description: item.description.trim(),
      technologies: item.technologies.map((t) => t.trim()).filter(Boolean),
      bullets: item.bullets.map((b) => ({ id: b.id, text: b.text.trim() })).filter((b) => b.text !== ""),
    }))
    .filter(
      (item) =>
        item.name !== "" ||
        item.safeLink !== null ||
        item.description !== "" ||
        item.technologies.length > 0 ||
        item.bullets.length > 0,
    );

  const skillGroups = resume.skills
    .map((group) => ({
      id: group.id,
      category: group.category.trim(),
      items: group.items.map((s) => s.trim()).filter(Boolean),
    }))
    .filter((group) => group.category !== "" || group.items.length > 0);

  const educationEntries = resume.education
    .map((item) => ({
      id: item.id,
      institution: item.institution.trim(),
      degree: item.degree.trim(),
      location: item.location.trim(),
      dateRange: formatDateRange(item.startDate, item.endDate),
      details: item.details.trim(),
    }))
    .filter(
      (item) =>
        item.institution !== "" ||
        item.degree !== "" ||
        item.location !== "" ||
        item.dateRange !== "" ||
        item.details !== "",
    );

  return (
    <article
      data-testid="resume-sheet"
      data-template={template}
      data-page-size={pageSize}
      aria-label="Resume preview sheet"
      className={`mx-auto w-full bg-white text-slate-900 shadow-md ring-1 ring-slate-900/5 ${styles.sheet}`}
    >
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.name}>{fullName || "Untitled Resume"}</h1>
          {headline !== "" && <p className={styles.headline}>{headline}</p>}
        </div>
        {(contactTexts.length > 0 || contactLinks.length > 0) && (
          <div className={styles.contactList}>
            {contactTexts.map((text, idx) => (
              <span key={`text-${idx}`}>{text}</span>
            ))}
            {contactLinks.map((href) => (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer" className={styles.link}>
                {formatLinkLabel(href)}
              </a>
            ))}
          </div>
        )}
      </header>

      <div className={styles.body}>
        {summary !== "" && (
          <section aria-label="Professional Summary" className={styles.section}>
            <h2 className={styles.sectionHeading}>Professional Summary</h2>
            <p className={styles.summary}>{summary}</p>
          </section>
        )}

        {experienceEntries.length > 0 && (
          <section aria-label="Experience" className={styles.section}>
            <h2 className={styles.sectionHeading}>Experience</h2>
            <div className={styles.entryList}>
              {experienceEntries.map((item) => (
                <div key={item.id} className={`resume-entry ${styles.entry}`}>
                  <EntryHeader
                    primary={item.role}
                    secondary={item.company}
                    location={item.location}
                    dateRange={item.dateRange}
                    styles={styles}
                  />
                  {item.bullets.length > 0 && (
                    <ul className={styles.bulletList}>
                      {item.bullets.map((bullet) => (
                        <li key={bullet.id} className={styles.bulletItem}>
                          {bullet.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {projectEntries.length > 0 && (
          <section aria-label="Projects" className={styles.section}>
            <h2 className={styles.sectionHeading}>Projects</h2>
            <div className={styles.entryList}>
              {projectEntries.map((item) => (
                <div key={item.id} className={`resume-entry ${styles.entry}`}>
                  <div className={styles.entryPrimaryRow}>
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <h3 className={styles.entryTitle}>{item.name || "Untitled Project"}</h3>
                      {item.safeLink && (
                        <a
                          href={item.safeLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`text-xs ${styles.link}`}
                        >
                          {formatLinkLabel(item.safeLink)}
                        </a>
                      )}
                    </div>
                    {item.technologies.length > 0 && (
                      <span className={styles.techList}>{item.technologies.join(" · ")}</span>
                    )}
                  </div>
                  {item.description !== "" && <p className={styles.entryDescription}>{item.description}</p>}
                  {item.bullets.length > 0 && (
                    <ul className={styles.bulletList}>
                      {item.bullets.map((bullet) => (
                        <li key={bullet.id} className={styles.bulletItem}>
                          {bullet.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {skillGroups.length > 0 && (
          <section aria-label="Skills" className={styles.section}>
            <h2 className={styles.sectionHeading}>Skills</h2>
            <ul className={styles.skillList}>
              {skillGroups.map((group) => (
                <li key={group.id} className={`resume-entry ${styles.skillRow}`}>
                  {group.category !== "" && (
                    <span className={styles.skillCategory}>
                      {group.category}
                      {group.items.length > 0 ? ": " : ""}
                    </span>
                  )}
                  {group.items.length > 0 && <span>{group.items.join(", ")}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {educationEntries.length > 0 && (
          <section aria-label="Education" className={styles.section}>
            <h2 className={styles.sectionHeading}>Education</h2>
            <div className={styles.entryList}>
              {educationEntries.map((item) => (
                <div key={item.id} className={`resume-entry ${styles.entry}`}>
                  <EntryHeader
                    primary={item.institution}
                    secondary={item.degree}
                    location={item.location}
                    dateRange={item.dateRange}
                    styles={styles}
                  />
                  {item.details !== "" && <p className={styles.entryDescription}>{item.details}</p>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </article>
  );
}
