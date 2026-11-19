import { render, screen, within } from "@testing-library/react";
import { createSampleWorkspace } from "../../data/sampleWorkspace";
import { createEmptyResume } from "../../lib/schema";
import type { PageSize, ResumeData, TemplateId } from "../../types/resume";
import { ResumePreview } from "./ResumePreview";
import { PAGE_SIZE_LIST, TEMPLATE_LIST, TEMPLATES } from "./templates";

describe("ResumePreview", () => {
  it("renders semantic ATS-safe HTML with zero tables or canvas across all 3 templates", () => {
    const sample = createSampleWorkspace().resume;

    for (const template of TEMPLATE_LIST) {
      const { unmount } = render(
        <ResumePreview resume={sample} template={template.id} pageSize="letter" />,
      );

      const sheet = screen.getByTestId("resume-sheet");
      expect(sheet.tagName).toBe("ARTICLE");
      expect(sheet).toHaveAttribute("data-template", template.id);
      expect(sheet).toHaveAttribute("data-page-size", "letter");
      expect(sheet.className).toContain("bg-white");
      expect(sheet.className).toContain("text-slate-900");

      expect(sheet.querySelector("table")).toBeNull();
      expect(sheet.querySelector("canvas")).toBeNull();
      expect(sheet.querySelector("header")).not.toBeNull();

      expect(within(sheet).getByRole("heading", { level: 1, name: "Alex Morgan" })).toBeInTheDocument();
      expect(within(sheet).getByRole("heading", { level: 2, name: "Professional Summary" })).toBeInTheDocument();
      expect(within(sheet).getByRole("heading", { level: 2, name: "Experience" })).toBeInTheDocument();
      expect(within(sheet).getByRole("heading", { level: 2, name: "Projects" })).toBeInTheDocument();
      expect(within(sheet).getByRole("heading", { level: 2, name: "Skills" })).toBeInTheDocument();
      expect(within(sheet).getByRole("heading", { level: 2, name: "Education" })).toBeInTheDocument();

      expect(within(sheet).getByRole("heading", { level: 3, name: "Senior Software Engineer" })).toBeInTheDocument();
      expect(within(sheet).getByRole("heading", { level: 3, name: "TraceKit" })).toBeInTheDocument();
      expect(sheet.querySelectorAll("ul").length).toBeGreaterThanOrEqual(4);
      expect(sheet.querySelectorAll("li").length).toBeGreaterThanOrEqual(10);

      unmount();
    }
  });

  it("applies distinct typography and layout definitions for each template and page size", () => {
    const sample = createSampleWorkspace().resume;
    const combinations: Array<[TemplateId, PageSize]> = [
      ["classic-executive", "letter"],
      ["modern-minimal", "a4"],
      ["technical-compact", "letter"],
    ];

    expect(PAGE_SIZE_LIST.map((p) => p.id)).toEqual(["letter", "a4"]);

    for (const [template, pageSize] of combinations) {
      const { unmount } = render(
        <ResumePreview resume={sample} template={template} pageSize={pageSize} />,
      );
      const sheet = screen.getByTestId("resume-sheet");
      expect(sheet).toHaveAttribute("data-template", template);
      expect(sheet).toHaveAttribute("data-page-size", pageSize);

      if (template === "classic-executive") {
        expect(sheet.className).toContain("font-serif");
        expect(TEMPLATES[template].styles.header).toContain("text-center");
      } else if (template === "modern-minimal") {
        expect(sheet.className).toContain("font-sans");
        expect(TEMPLATES[template].styles.headline).toContain("text-indigo-700");
      } else {
        expect(TEMPLATES[template].styles.compactEntry).toBe(true);
        expect(TEMPLATES[template].styles.sectionHeading).toContain("font-mono");
      }
      unmount();
    }
  });

  it("renders safe http/https/mailto links and omits unsafe or malformed URLs", () => {
    const resume: ResumeData = {
      ...createEmptyResume(),
      contact: {
        fullName: "Ada Lovelace",
        headline: "Principal Engineer",
        email: "ada@example.com",
        phone: "",
        location: "London",
        website: "https://adalovelace.example.com/",
        linkedin: "javascript:alert(1)",
        github: "data:text/html,<script>alert(1)</script>",
      },
      projects: [
        {
          id: "p1",
          name: "Analytical Engine",
          link: "https://github.com/ada/engine",
          description: "Symbolic computation runtime.",
          technologies: ["C++", "Rust"],
          bullets: [{ id: "b1", text: "Compiled Bernoulli routines in 12ms." }],
        },
        {
          id: "p2",
          name: "Unsafe Project",
          link: "vbscript:msgbox(1)",
          description: "Test unsafe project link.",
          technologies: [],
          bullets: [],
        },
      ],
    };

    render(<ResumePreview resume={resume} template="modern-minimal" pageSize="a4" />);
    const sheet = screen.getByTestId("resume-sheet");
    const links = within(sheet).getAllByRole("link");

    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "https://adalovelace.example.com/");
    expect(links[0]).toHaveTextContent("adalovelace.example.com");
    expect(links[1]).toHaveAttribute("href", "https://github.com/ada/engine");
    expect(links[1]).toHaveTextContent("github.com/ada/engine");

    expect(sheet.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(sheet.querySelector('a[href^="data:"]')).toBeNull();
    expect(sheet.querySelector('a[href^="vbscript:"]')).toBeNull();
    expect(sheet.textContent).not.toContain("javascript:alert(1)");
  });

  it("omits empty sections and blank entries or bullets gracefully", () => {
    const empty = createEmptyResume();
    const { rerender } = render(
      <ResumePreview resume={empty} template="classic-executive" pageSize="letter" />,
    );

    const sheet = screen.getByTestId("resume-sheet");
    expect(within(sheet).getByRole("heading", { level: 1, name: "Untitled Resume" })).toBeInTheDocument();
    expect(sheet.querySelectorAll("section")).toHaveLength(0);
    expect(within(sheet).queryAllByRole("heading", { level: 2 })).toHaveLength(0);

    const blankItemsResume: ResumeData = {
      ...empty,
      contact: { ...empty.contact, fullName: "Linus Torvalds" },
      summary: "   ",
      experience: [
        {
          id: "e-blank",
          company: "  ",
          role: "",
          location: "",
          startDate: "",
          endDate: "",
          bullets: [{ id: "b-empty", text: "   " }],
        },
      ],
      projects: [
        {
          id: "p-blank",
          name: " ",
          link: "not-a-url",
          description: "",
          technologies: ["  "],
          bullets: [{ id: "pb-empty", text: "" }],
        },
      ],
      skills: [{ id: "s-blank", category: "  ", items: [" ", ""] }],
      education: [
        {
          id: "ed-blank",
          institution: "",
          degree: " ",
          location: "",
          startDate: "",
          endDate: "",
          details: "",
        },
      ],
    };

    rerender(<ResumePreview resume={blankItemsResume} template="technical-compact" pageSize="a4" />);
    expect(within(sheet).getByRole("heading", { level: 1, name: "Linus Torvalds" })).toBeInTheDocument();
    expect(sheet.querySelectorAll("section")).toHaveLength(0);
    expect(sheet.querySelectorAll("ul")).toHaveLength(0);
  });
});
