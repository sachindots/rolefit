import type { WorkspaceState } from "../types/resume";

export const SAMPLE_JOB_DESCRIPTION = `Staff Software Engineer, Platform — Northwind Labs

About the role
We are hiring a Staff Software Engineer to lead the architecture of our customer-facing platform. You will design distributed systems that serve millions of requests per day and partner with product and design to evolve our design systems.

What you will do
- Build and maintain services in TypeScript and Node.js, and rich interfaces in React.
- Model data and tune queries in PostgreSQL.
- Own CI/CD pipelines and drive reliability, observability and on-call practices.
- Contribute performance-critical native modules in C++ where latency matters.
- Mentor engineers and lead technical design reviews across teams.

What we are looking for
- 8+ years of professional software engineering experience.
- Deep experience with TypeScript, React and Node.js.
- Proven track record shipping and scaling distributed systems.
- Familiarity with design systems, accessibility and component libraries.
- Strong written communication and cross-team leadership.`;

export function createSampleWorkspace(): WorkspaceState {
  return {
    schemaVersion: 1,
    resume: {
      contact: {
        fullName: "Alex Morgan",
        headline: "Senior Software Engineer",
        email: "alex.morgan@example.com",
        phone: "+1 (555) 013-2847",
        location: "Austin, TX",
        website: "https://alexmorgan.example.com",
        linkedin: "https://www.linkedin.com/in/alexmorgan-example",
        github: "https://github.com/alexmorgan-example",
      },
      summary:
        "Senior software engineer with 9 years of experience building and scaling web platforms. Led teams delivering TypeScript, React and Node.js products used by over 2 million people, with a focus on reliability, developer experience and mentoring.",
      experience: [
        {
          id: "exp-brightpath",
          company: "BrightPath",
          role: "Senior Software Engineer",
          location: "Austin, TX",
          startDate: "2020-03",
          endDate: "Present",
          bullets: [
            { id: "b-bp-1", text: "Led a team of 6 engineers to rebuild the checkout flow in React and TypeScript, increasing conversion by 18% and cutting page load time by 42%." },
            { id: "b-bp-2", text: "Designed an event-driven order pipeline across distributed systems handling 3M events per day with 99.98% uptime." },
            { id: "b-bp-3", text: "Introduced CI/CD with automated canary releases, reducing deployment time from 45 minutes to 6 minutes." },
            { id: "b-bp-4", text: "Responsible for maintaining the frontend codebase and helping with various bugs." },
          ],
        },
        {
          id: "exp-datawave",
          company: "DataWave",
          role: "Software Engineer",
          location: "Remote",
          startDate: "2016-06",
          endDate: "2020-02",
          bullets: [
            { id: "b-dw-1", text: "Built Node.js APIs serving 1,200 requests per second and migrated 40 services to TypeScript, reducing production defects by 31%." },
            { id: "b-dw-2", text: "Rewrote a latency-sensitive parsing library in C++, improving throughput 5x for the ingestion team." },
            { id: "b-dw-3", text: "Worked on improving performance of various services." },
          ],
        },
      ],
      projects: [
        {
          id: "proj-tracekit",
          name: "TraceKit",
          link: "https://github.com/alexmorgan-example/tracekit",
          description: "Open-source tracing toolkit for Node.js services.",
          technologies: ["TypeScript", "Node.js", "OpenTelemetry"],
          bullets: [
            { id: "b-tk-1", text: "Grew the project to 1,500 GitHub stars and 40 contributors within 18 months." },
          ],
        },
      ],
      skills: [
        { id: "skill-lang", category: "Languages", items: ["TypeScript", "JavaScript", "C++", "SQL"] },
        { id: "skill-fw", category: "Frameworks", items: ["React", "Node.js", "Express", "Vite"] },
        { id: "skill-ops", category: "Practices", items: ["CI/CD", "Observability", "Mentoring", "Technical design"] },
      ],
      education: [
        {
          id: "edu-ut",
          institution: "University of Texas at Austin",
          degree: "B.S. Computer Science",
          location: "Austin, TX",
          startDate: "2008",
          endDate: "2012",
          details: "Graduated with honors.",
        },
      ],
    },
    jobDescription: SAMPLE_JOB_DESCRIPTION,
    template: "classic-executive",
    pageSize: "letter",
    theme: "light",
  };
}
