import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { createSampleWorkspace } from "../../data/sampleWorkspace";
import { createEmptyResume } from "../../lib/schema";
import type { ResumeData } from "../../types/resume";
import { JdMatchPanel } from "./JdMatchPanel";

function PanelHarness({
  initialResume = createSampleWorkspace().resume,
  initialJd = createSampleWorkspace().jobDescription,
}: {
  initialResume?: ResumeData;
  initialJd?: string;
}) {
  const [resume] = useState<ResumeData>(initialResume);
  const [jd, setJd] = useState(initialJd);
  return <JdMatchPanel resume={resume} jobDescription={jd} onJobDescriptionChange={setJd} />;
}

describe("JdMatchPanel", () => {
  it("displays live match score, matched keyword chips, and missing keyword chips for sample workspace", () => {
    render(<PanelHarness />);

    const scoreBadge = screen.getByTestId("jd-match-score");
    const numericScore = Number.parseInt(scoreBadge.textContent ?? "0", 10);
    expect(numericScore).toBeGreaterThan(50);
    expect(numericScore).toBeLessThan(100);

    const matchedRegion = screen.getByTestId("matched-keywords");
    expect(within(matchedRegion).getByText("TypeScript")).toBeInTheDocument();
    expect(within(matchedRegion).getByText("React")).toBeInTheDocument();
    expect(within(matchedRegion).getByText("Node.js")).toBeInTheDocument();
    expect(within(matchedRegion).getByText("CI/CD")).toBeInTheDocument();
    expect(within(matchedRegion).getByText("C++")).toBeInTheDocument();
    expect(within(matchedRegion).getByText("distributed systems")).toBeInTheDocument();

    const missingRegion = screen.getByTestId("missing-keywords");
    expect(within(missingRegion).getByText("PostgreSQL")).toBeInTheDocument();
    expect(within(missingRegion).getByText("design systems")).toBeInTheDocument();
  });

  it("accurately extracts and separates symbol-bearing tokens (C++, C#, .NET, Node.js, CI/CD) when JD changes", () => {
    render(<PanelHarness initialJd="Looking for C++, C#, .NET, Node.js, and CI/CD experience." />);

    const matchedRegion = screen.getByTestId("matched-keywords");
    const missingRegion = screen.getByTestId("missing-keywords");

    expect(within(matchedRegion).getByText("C++")).toBeInTheDocument();
    expect(within(matchedRegion).getByText("Node.js")).toBeInTheDocument();
    expect(within(matchedRegion).getByText("CI/CD")).toBeInTheDocument();

    expect(within(missingRegion).getByText("C#")).toBeInTheDocument();
    expect(within(missingRegion).getByText(".NET")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear JD" }));
    expect(screen.getByTestId("jd-match-score")).toHaveTextContent("0%");
  });

  it("copies a keyword chip on click and surfaces accessible status feedback", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<PanelHarness />);
    const missingRegion = screen.getByTestId("missing-keywords");
    fireEvent.click(within(missingRegion).getByRole("button", { name: /Copy keyword PostgreSQL/i }));

    expect(writeText).toHaveBeenCalledWith("PostgreSQL");
    expect(screen.getByTestId("copied-keyword-status")).toHaveTextContent('Copied "PostgreSQL" to clipboard.');
  });

  it("renders Bullet-Impact & ATS Audit findings with role/project context and actionable suggestions", () => {
    render(<PanelHarness />);

    const auditSection = screen.getByTestId("ats-audit-section");
    expect(within(auditSection).getAllByText(/Experience · Senior Software Engineer at BrightPath · Bullet 4/).length).toBeGreaterThanOrEqual(2);
    expect(within(auditSection).getByText(/Weak or passive opening: "Responsible for"/i)).toBeInTheDocument();
    expect(within(auditSection).getAllByText(/Experience · Software Engineer at DataWave · Bullet 3/).length).toBeGreaterThanOrEqual(2);
    expect(within(auditSection).getByText(/Weak or passive opening: "Worked on"/i)).toBeInTheDocument();
  });

  it("flags missing contact info, empty skills, and short/long bullets on an incomplete resume", () => {
    const resume = createEmptyResume();
    resume.experience = [
      {
        id: "exp-1",
        company: "Acme",
        role: "Engineer",
        location: "Remote",
        startDate: "2022",
        endDate: "2024",
        bullets: [{ id: "b-1", text: "Too short" }],
      },
    ];

    render(<PanelHarness initialResume={resume} initialJd="" />);

    const auditSection = screen.getByTestId("ats-audit-section");
    expect(within(auditSection).getByText("Missing name.")).toBeInTheDocument();
    expect(within(auditSection).getByText("Skills section is empty.")).toBeInTheDocument();
    expect(within(auditSection).getByText(/Bullet is too short/)).toBeInTheDocument();
  });
});
