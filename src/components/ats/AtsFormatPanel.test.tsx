import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { createSampleWorkspace } from "../../data/sampleWorkspace";
import { createEmptyResume } from "../../lib/schema";
import type { PageSize, ResumeData, TemplateId } from "../../types/resume";
import {
  AtsFormatPanel,
  getTopAtsFixes,
  mapBreakdownToEditorSection,
  mapCheckToEditorSection,
  type EditorSectionTarget,
} from "./AtsFormatPanel";

function PanelHarness({
  initialResume = createSampleWorkspace().resume,
  initialJd = createSampleWorkspace().jobDescription,
  initialTemplate = "classic-executive",
  initialPageSize = "letter",
  onJumpToSection,
}: {
  initialResume?: ResumeData;
  initialJd?: string;
  initialTemplate?: TemplateId;
  initialPageSize?: PageSize;
  onJumpToSection?: (section: EditorSectionTarget) => void;
}) {
  const [resume, setResume] = useState<ResumeData>(initialResume);
  const [jd, setJd] = useState(initialJd);
  const [template, setTemplate] = useState<TemplateId>(initialTemplate);
  const [pageSize, setPageSize] = useState<PageSize>(initialPageSize);

  return (
    <div>
      <div>
        <button
          type="button"
          onClick={() =>
            setResume((prev) => ({
              ...prev,
              contact: { ...prev.contact, email: "", phone: "" },
              skills: [],
            }))
          }
        >
          Strip contact and skills
        </button>
        <button type="button" onClick={() => setJd("")}>
          Clear JD
        </button>
        <button type="button" onClick={() => setTemplate("technical-compact")}>
          Use Technical Compact
        </button>
        <button type="button" onClick={() => setPageSize("a4")}>
          Use A4
        </button>
      </div>
      <AtsFormatPanel
        resume={resume}
        jobDescription={jd}
        template={template}
        pageSize={pageSize}
        onJumpToSection={onJumpToSection}
      />
    </div>
  );
}

describe("AtsFormatPanel", () => {
  it("renders the 0-100 ATS score, accessible progress bars, and 5-part breakdown with non-color status text", () => {
    render(<PanelHarness />);

    const scoreBadge = screen.getByTestId("ats-total-score");
    const numericScore = Number.parseInt(scoreBadge.textContent ?? "0", 10);
    expect(numericScore).toBeGreaterThanOrEqual(70);
    expect(numericScore).toBeLessThanOrEqual(100);
    expect(screen.getByTestId("ats-score-band")).toHaveTextContent(/Strong|Needs work|Critical gaps/);

    const overallBar = screen.getByRole("progressbar", { name: "Overall ATS readiness score" });
    expect(overallBar).toHaveAttribute("aria-valuenow", String(numericScore));
    expect(overallBar).toHaveAttribute("aria-valuemin", "0");
    expect(overallBar).toHaveAttribute("aria-valuemax", "100");

    expect(screen.getByTestId("ats-breakdown-parse-readiness")).toBeInTheDocument();
    expect(screen.getByTestId("ats-breakdown-section-structure")).toBeInTheDocument();
    expect(screen.getByTestId("ats-breakdown-keyword-match")).toBeInTheDocument();
    expect(screen.getByTestId("ats-breakdown-bullet-quality")).toBeInTheDocument();
    expect(screen.getByTestId("ats-breakdown-length-density")).toBeInTheDocument();

    expect(screen.getByTestId("ats-breakdown-score-parse-readiness")).toHaveTextContent("25/25 pts");
    expect(screen.getByTestId("ats-breakdown-status-parse-readiness")).toHaveTextContent("Pass");
  });

  it("recalculates ATS score and redistributes weights live when resume or job description changes", () => {
    render(<PanelHarness />);

    const initialScore = Number.parseInt(
      screen.getByTestId("ats-total-score").textContent ?? "0",
      10,
    );
    expect(screen.getByTestId("ats-breakdown-score-parse-readiness")).toHaveTextContent("/25 pts");
    expect(screen.getByTestId("ats-breakdown-score-keyword-match")).toHaveTextContent("/25 pts");

    // Clear JD -> weights redistribute to 33 / 27 / 0 / 27 / 13
    fireEvent.click(screen.getByRole("button", { name: "Clear JD" }));
    expect(screen.getByTestId("ats-breakdown-score-parse-readiness")).toHaveTextContent("33/33 pts");
    expect(screen.getByTestId("ats-breakdown-score-section-structure")).toHaveTextContent(
      "27/27 pts",
    );
    expect(screen.getByTestId("ats-breakdown-score-keyword-match")).toHaveTextContent("0/0 pts");
    expect(screen.getByTestId("ats-breakdown-status-keyword-match")).toHaveTextContent("No JD");

    // Strip contact and skills -> score drops immediately
    fireEvent.click(screen.getByRole("button", { name: "Strip contact and skills" }));
    const degradedScore = Number.parseInt(
      screen.getByTestId("ats-total-score").textContent ?? "0",
      10,
    );
    expect(degradedScore).toBeLessThan(initialScore);
  });

  it("switches across Harvard, London UK CV, and FAANG profiles and displays pass/warn/fail checks with official/convention source labels", () => {
    render(<PanelHarness />);

    const switcher = screen.getByRole("group", { name: "Format profile" });
    const harvardBtn = within(switcher).getByRole("button", { name: "Harvard" });
    const londonBtn = within(switcher).getByRole("button", { name: /London/i });
    const faangBtn = within(switcher).getByRole("button", { name: "FAANG" });

    // Harvard default
    expect(harvardBtn).toHaveAttribute("aria-pressed", "true");
    expect(londonBtn).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("format-check-harvard-reverse-chronological")).toBeInTheDocument();
    expect(
      screen.getByTestId("format-check-status-harvard-reverse-chronological"),
    ).toHaveTextContent("Pass");
    expect(
      screen.getByTestId("format-check-source-kind-harvard-reverse-chronological"),
    ).toHaveTextContent("Official");
    expect(
      screen.getByTestId("format-check-source-harvard-reverse-chronological"),
    ).toHaveTextContent(/Harvard FAS Office of Career Services/);
    expect(
      screen.getByTestId("format-check-source-kind-harvard-action-verbs"),
    ).toHaveTextContent("Convention");

    // Switch to London UK CV
    fireEvent.click(londonBtn);
    expect(londonBtn).toHaveAttribute("aria-pressed", "true");
    expect(harvardBtn).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("format-check-uk-no-protected-fields")).toBeInTheDocument();
    expect(screen.getByTestId("format-check-status-uk-a4-page-size")).toHaveTextContent("Warn");
    expect(screen.getByTestId("format-check-source-kind-uk-page-length")).toHaveTextContent(
      "Official",
    );
    expect(screen.getByTestId("format-check-source-kind-uk-a4-page-size")).toHaveTextContent(
      "Convention",
    );

    // Live recalculation when pageSize switches to A4
    fireEvent.click(screen.getByRole("button", { name: "Use A4" }));
    expect(screen.getByTestId("format-check-status-uk-a4-page-size")).toHaveTextContent("Pass");

    // Switch to FAANG
    fireEvent.click(faangBtn);
    expect(faangBtn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("format-check-faang-single-column")).toBeInTheDocument();
    expect(screen.getByTestId("format-check-faang-xyz-bullets")).toBeInTheDocument();
    expect(screen.getByTestId("format-check-source-kind-faang-xyz-bullets")).toHaveTextContent(
      "Official",
    );
    expect(
      screen.getByTestId("format-check-source-kind-faang-quantified-bullets"),
    ).toHaveTextContent("Convention");

    // Live recalculation when template switches to Technical Compact
    fireEvent.click(harvardBtn);
    fireEvent.click(screen.getByRole("button", { name: "Use Technical Compact" }));
    expect(screen.getByTestId("format-check-harvard-font-margins")).toHaveTextContent(
      /Technical Compact uses 9pt body text/,
    );
  });

  it("links failing and warning checks that map to a section directly to the editor", () => {
    const onJumpToSection = vi.fn();
    const resume = createEmptyResume();
    resume.contact.fullName = "Ada Lovelace (profile photo)";
    resume.summary = "I built analytical engines for my team.";
    resume.experience = [
      {
        id: "exp-1",
        company: "Babbage Labs",
        role: "Engineer",
        location: "London",
        startDate: "2020",
        endDate: "2021",
        bullets: [{ id: "b-1", text: "Worked on math routines." }],
      },
      {
        id: "exp-2",
        company: " Newer Corp",
        role: "Lead Engineer",
        location: "London",
        startDate: "2023",
        endDate: "2024",
        bullets: [{ id: "b-2", text: "Responsible for engine design." }],
      },
    ];

    render(<PanelHarness initialResume={resume} initialJd="" onJumpToSection={onJumpToSection} />);

    // Harvard failing reverse-chronological check links to Experience
    const revJump = screen.getByTestId("format-check-jump-harvard-reverse-chronological");
    expect(revJump).toHaveTextContent("Go to Experience in Editor");
    fireEvent.click(revJump);
    expect(onJumpToSection).toHaveBeenCalledWith("Experience");

    // Harvard failing photo/graphics check links to Contact
    const photoJump = screen.getByTestId("format-check-jump-harvard-no-photo-graphics");
    expect(photoJump).toHaveTextContent("Go to Contact in Editor");
    fireEvent.click(photoJump);
    expect(onJumpToSection).toHaveBeenCalledWith("Contact");

    // Harvard failing education order check links to Education
    const eduJump = screen.getByTestId("format-check-jump-harvard-education-order");
    expect(eduJump).toHaveTextContent("Go to Education in Editor");
    fireEvent.click(eduJump);
    expect(onJumpToSection).toHaveBeenCalledWith("Education");

    // Harvard first-person pronoun warning in summary links to Professional Summary
    const pronounJump = screen.getByTestId("format-check-jump-harvard-no-first-person");
    expect(pronounJump).toHaveTextContent("Go to Professional Summary in Editor");
    fireEvent.click(pronounJump);
    expect(onJumpToSection).toHaveBeenCalledWith("Professional Summary");

    // Switch to FAANG -> empty skills fails and links to Skills
    fireEvent.click(
      within(screen.getByRole("group", { name: "Format profile" })).getByRole("button", {
        name: "FAANG",
      }),
    );
    const skillsJump = screen.getByTestId("format-check-jump-faang-skills-section");
    expect(skillsJump).toHaveTextContent("Go to Skills in Editor");
    fireEvent.click(skillsJump);
    expect(onJumpToSection).toHaveBeenCalledWith("Skills");
  });

  it("computes top 3 fixes ordered by point impact and feeds JD keywords when a JD is provided", () => {
    const resume = createEmptyResume();
    resume.contact.fullName = "Jordan Lee";
    resume.contact.email = "jordan@example.com";

    const fixesWithoutJd = getTopAtsFixes(resume, "");
    expect(fixesWithoutJd).toHaveLength(3);
    expect(fixesWithoutJd[0]!.pointsLost).toBeGreaterThanOrEqual(fixesWithoutJd[1]!.pointsLost);
    expect(fixesWithoutJd[1]!.pointsLost).toBeGreaterThanOrEqual(fixesWithoutJd[2]!.pointsLost);
    expect(fixesWithoutJd.some((f) => f.id === "fix-keyword-match")).toBe(false);

    const fixesWithJd = getTopAtsFixes(
      resume,
      "Seeking a Staff Engineer skilled in TypeScript, Kubernetes, PostgreSQL, and Terraform.",
    );
    expect(fixesWithJd).toHaveLength(3);
    expect(fixesWithJd.some((f) => f.id === "fix-keyword-match")).toBe(true);
    const kwFix = fixesWithJd.find((f) => f.id === "fix-keyword-match");
    expect(kwFix?.detail).toMatch(/TypeScript|Kubernetes|PostgreSQL|Terraform/);
    expect(getTopAtsFixes(resume, "", 0)).toEqual([]);
  });

  it("maps project-only resumes and unknown checks accurately in section helpers", () => {
    const projectOnly = createEmptyResume();
    projectOnly.projects = [
      {
        id: "p-1",
        name: "Compiler",
        link: "",
        description: "Fast compiler",
        technologies: ["Rust"],
        bullets: [{ id: "pb-1", text: "Worked on parser." }],
      },
    ];

    expect(mapBreakdownToEditorSection("bullet-quality", projectOnly)).toBe("Projects");
    expect(
      mapCheckToEditorSection(
        {
          id: "harvard-action-verbs",
          label: "Action verbs",
          status: "fail",
          message: "Weak verbs",
          sourceKind: "convention",
          source: "Harvard",
        },
        projectOnly,
      ),
    ).toBe("Projects");
    expect(
      mapCheckToEditorSection(
        {
          id: "harvard-pdf-output",
          label: "PDF",
          status: "pass",
          message: "PDF",
          sourceKind: "official",
          source: "Harvard",
        },
        projectOnly,
      ),
    ).toBeNull();
  });
});
