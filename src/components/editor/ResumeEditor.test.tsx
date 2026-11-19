import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { createSampleWorkspace } from "../../data/sampleWorkspace";
import { createEmptyResume, validateResume } from "../../lib/schema";
import type { ResumeData } from "../../types/resume";
import { ResumeEditor } from "./ResumeEditor";

let latest: ResumeData;

function Harness({ initial }: { initial: ResumeData }) {
  const [resume, setResume] = useState(initial);
  latest = resume;
  return <ResumeEditor resume={resume} onChange={setResume} />;
}

const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const empty = () => render(<Harness initial={createEmptyResume()} />);

describe("ResumeEditor", () => {
  it("edits contact fields and shows summary counter", () => {
    empty();
    type("Full name", "Ada Lovelace");
    type("Summary", "one two three");
    expect(latest.contact.fullName).toBe("Ada Lovelace");
    expect(screen.getByText(/3 words · 13\/2000 characters/)).toBeInTheDocument();
  });

  it("does not commit an invalid URL and commits a valid one", () => {
    empty();
    type("Website", "javascript:alert(1)");
    expect(latest.contact.website).toBe("");
    expect(screen.getByText(/Not saved until valid/)).toBeInTheDocument();
    type("Website", "https://ada.dev");
    expect(latest.contact.website).toBe("https://ada.dev");
    expect(screen.queryByText(/Not saved until valid/)).toBeNull();
  });

  it("adds, edits, reorders and removes roles and bullets", () => {
    empty();
    click("Add role");
    click("Add role");
    type("Company (role 1)", "Acme");
    type("Company (role 2)", "Globex");
    expect(screen.getByRole("button", { name: "Move role 1 up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move role 2 down" })).toBeDisabled();
    click("Move role 2 up");
    expect(latest.experience.map((e) => e.company)).toEqual(["Globex", "Acme"]);

    click("Add bullet to role 1");
    click("Add bullet to role 1");
    type("role 1 bullet 1", "first");
    type("role 1 bullet 2", "second");
    click("Move role 1 bullet 2 up");
    expect(latest.experience[0]?.bullets.map((b) => b.text)).toEqual(["second", "first"]);
    click("Remove role 1 bullet 1");
    expect(latest.experience[0]?.bullets.map((b) => b.text)).toEqual(["first"]);
    click("Remove role 1");
    expect(latest.experience.map((e) => e.company)).toEqual(["Acme"]);
    expect(validateResume(latest).ok).toBe(true);
  });

  it("keeps focus on a bullet while typing and after reordering", () => {
    empty();
    click("Add role");
    click("Add bullet to role 1");
    click("Add bullet to role 1");
    const first = screen.getByLabelText("role 1 bullet 1");
    first.focus();
    fireEvent.change(first, { target: { value: "x" } });
    expect(screen.getByLabelText("role 1 bullet 1")).toBe(first);
    expect(first).toHaveFocus();
    click("Move role 1 bullet 1 down");
    expect(screen.getByLabelText("role 1 bullet 2")).toBe(first);
  });

  it("edits projects with technologies, link hint and bullets", () => {
    empty();
    click("Add project");
    type("Name (project 1)", "RoleFit");
    type("Technologies (project 1) (comma separated)", "React, TypeScript, ");
    type("Link (project 1)", "ftp://x");
    expect(screen.getByText(/Enter a full http/)).toBeInTheDocument();
    type("Link (project 1)", "https://github.com/x/y");
    click("Add bullet to project 1");
    type("project 1 bullet 1", "Shipped it");
    expect(latest.projects[0]).toMatchObject({
      name: "RoleFit",
      technologies: ["React", "TypeScript"],
      link: "https://github.com/x/y",
      bullets: [{ text: "Shipped it" }],
    });
    click("Add project");
    click("Move project 2 up");
    expect(latest.projects[1]?.name).toBe("RoleFit");
    click("Remove project 1");
    expect(latest.projects).toHaveLength(1);
  });

  it("manages skill groups and education", () => {
    empty();
    click("Add skill group");
    click("Add skill group");
    type("Category (skill group 1)", "Languages");
    type("Skills (skill group 1) (comma separated)", "Go, Rust");
    type("Category (skill group 2)", "Tools");
    click("Move skill group 2 up");
    expect(latest.skills.map((s) => s.category)).toEqual(["Tools", "Languages"]);
    expect(latest.skills[1]?.items).toEqual(["Go", "Rust"]);
    click("Remove skill group 1");
    expect(latest.skills).toHaveLength(1);

    click("Add education");
    click("Add education");
    type("Institution (education 1)", "MIT");
    type("Institution (education 2)", "Stanford");
    type("Details / GPA (education 2)", "GPA 4.0");
    click("Move education 2 up");
    expect(latest.education.map((e) => e.institution)).toEqual(["Stanford", "MIT"]);
    expect(latest.education[0]?.details).toBe("GPA 4.0");
    click("Remove education 2");
    expect(latest.education.map((e) => e.institution)).toEqual(["Stanford"]);
  });

  it("collapses a section and shows the item count", () => {
    render(<Harness initial={createSampleWorkspace().resume} />);
    const section = screen.getByRole("region", { name: "Experience" });
    const toggle = within(section).getByRole("button", { name: /Experience/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(section).getByLabelText(`${latest.experience.length} items`)).toBeInTheDocument();
  });

  it("enforces maxLength on text inputs", () => {
    empty();
    expect(screen.getByLabelText("Full name")).toHaveAttribute("maxLength", "200");
    expect(screen.getByLabelText("Summary")).toHaveAttribute("maxLength", "2000");
  });
});
