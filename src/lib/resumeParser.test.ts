import { parseResumeText } from "./resumeParser";
import { validateResume } from "./schema";

const FULL = `ALEX MORGAN
Senior Software Engineer
Austin, TX | alex.morgan@example.com | +1 (555) 013-2847
linkedin.com/in/alexmorgan | github.com/alexmorgan | https://alexmorgan.dev

PROFESSIONAL SUMMARY
Engineer with 9 years of experience building web platforms.
Focused on reliability and mentoring.

WORK EXPERIENCE
Senior Software Engineer | BrightPath                      Mar 2020 – Present
Austin, TX
• Led a team of 6 engineers to rebuild checkout, increasing conversion by 18%
  and cutting load time by 42%.
• Designed an event-driven pipeline handling 3M events per day.

DataWave — Software Engineer                                2016-06 - 2020-02
- Built Node.js APIs serving 1,200 requests per second.
* Migrated 40 services to TypeScript.

Intern at Acme Corp (2015 - 2016)
▪ Wrote internal tooling.

PROJECTS
TraceKit | TypeScript, Node.js
https://github.com/alexmorgan/tracekit
Open-source tracing toolkit.
- Reached 1,500 stars.

Tech: Rust, WASM

SKILLS
Languages: TypeScript, JavaScript, C++
Frameworks: React; Node.js | Express

EDUCATION
University of Texas at Austin
B.S. Computer Science, 2008 - 2012
Austin, TX
GPA: 3.8/4.0
`;

describe("parseResumeText: full resume", () => {
  const r = parseResumeText(FULL);

  it("always passes schema validation", () => {
    expect(validateResume(r.resume).ok).toBe(true);
  });

  it("extracts contact details", () => {
    expect(r.resume.contact).toEqual({
      fullName: "ALEX MORGAN",
      headline: "Senior Software Engineer",
      email: "alex.morgan@example.com",
      phone: "+1 (555) 013-2847",
      location: "Austin, TX",
      website: "https://alexmorgan.dev",
      linkedin: "https://linkedin.com/in/alexmorgan",
      github: "https://github.com/alexmorgan",
    });
  });

  it("detects sections in order", () => {
    expect(r.detectedSections).toEqual(["Summary", "Experience", "Projects", "Skills", "Education"]);
    expect(r.warnings).toEqual([]);
    expect(r.unmappedLines).toEqual([]);
  });

  it("parses the summary as one paragraph", () => {
    expect(r.resume.summary).toBe("Engineer with 9 years of experience building web platforms. Focused on reliability and mentoring.");
  });

  it("parses experience headers, dates, location and wrapped bullets", () => {
    const [a, b, c] = r.resume.experience;
    expect(r.resume.experience).toHaveLength(3);
    expect(a).toMatchObject({ role: "Senior Software Engineer", company: "BrightPath", location: "Austin, TX", startDate: "Mar 2020", endDate: "Present" });
    expect(a!.bullets.map((x) => x.text)).toEqual([
      "Led a team of 6 engineers to rebuild checkout, increasing conversion by 18% and cutting load time by 42%.",
      "Designed an event-driven pipeline handling 3M events per day.",
    ]);
    expect(b).toMatchObject({ company: "DataWave", role: "Software Engineer", startDate: "2016-06", endDate: "2020-02" });
    expect(b!.bullets).toHaveLength(2);
    expect(c).toMatchObject({ role: "Intern", company: "Acme Corp", startDate: "2015", endDate: "2016" });
    expect(c!.bullets).toHaveLength(1);
  });

  it("parses projects", () => {
    expect(r.resume.projects).toHaveLength(1);
    const p = r.resume.projects[0]!;
    expect(p).toMatchObject({ name: "TraceKit", link: "https://github.com/alexmorgan/tracekit", description: "Open-source tracing toolkit." });
    expect(p.technologies).toEqual(["TypeScript", "Node.js", "Rust", "WASM"]);
    expect(p.bullets.map((b) => b.text)).toEqual(["Reached 1,500 stars."]);
  });

  it("splits projects on blank lines and reads link and description", () => {
    const r = parseResumeText("Jane\nPROJECTS\nAlpha | React, Node.js\nA dashboard that wraps\nonto a second line.\n\nBeta - https://beta.dev\nTech: Go");
    expect(r.resume.projects).toHaveLength(2);
    expect(r.resume.projects[0]).toMatchObject({ name: "Alpha", description: "A dashboard that wraps onto a second line.", technologies: ["React", "Node.js"] });
    expect(r.resume.projects[1]).toMatchObject({ name: "Beta", link: "https://beta.dev", technologies: ["Go"] });
  });

  it("drops unsafe project links", () => {
    const r = parseResumeText("Jane\nPROJECTS\nAlpha javascript:alert(1)");
    expect(r.resume.projects[0]!.link).toBe("");
    expect(r.warnings).toContain("An unsafe project link was ignored.");
  });

  it("parses grouped skills", () => {
    expect(r.resume.skills.map((g) => [g.category, g.items])).toEqual([
      ["Languages", ["TypeScript", "JavaScript", "C++"]],
      ["Frameworks", ["React", "Node.js", "Express"]],
    ]);
  });

  it("parses education", () => {
    expect(r.resume.education).toHaveLength(1);
    expect(r.resume.education[0]).toMatchObject({
      institution: "University of Texas at Austin",
      degree: "B.S. Computer Science",
      startDate: "2008",
      endDate: "2012",
      location: "Austin, TX",
      details: "GPA: 3.8/4.0",
    });
  });

  it("generates unique ids", () => {
    const ids = [...r.resume.experience.flatMap((e) => [e.id, ...e.bullets.map((b) => b.id)])];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is deterministic apart from ids", () => {
    const strip = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === "id" ? undefined : v)));
    expect(strip(parseResumeText(FULL))).toEqual(strip(r));
  });
});

describe("heading formats", () => {
  it.each([
    "Experience", "EXPERIENCE:", "Work Experience", "=== Professional Experience ===", "Employment", "Career History", "--- experience ---",
  ])("recognizes %j", (heading) => {
    const r = parseResumeText(`Jane Doe\n\n${heading}\nEngineer | Acme  2020 - Present\n- Did things`);
    expect(r.detectedSections).toEqual(["Experience"]);
    expect(r.resume.experience[0]!.bullets).toHaveLength(1);
  });

  it.each([
    ["Profile", "Summary"], ["Objective", "Summary"], ["About", "Summary"],
    ["Personal Projects", "Projects"], ["Open Source", "Projects"], ["Selected Projects", "Projects"],
    ["Technical Skills", "Skills"], ["Core Competencies", "Skills"], ["Technologies", "Skills"],
    ["Academic Background", "Education"], ["Qualifications", "Education"],
  ])("maps %j to %s", (heading, label) => {
    expect(parseResumeText(`Jane Doe\n${heading}\nSomething useful`).detectedSections).toEqual([label]);
  });
});

describe("experience formats", () => {
  const first = (line: string) => parseResumeText(`Jane\nEXPERIENCE\n${line}\n- x`).resume.experience[0]!;

  it.each([
    ["Engineer | Acme  2020 - Present", "Engineer", "Acme", "2020", "Present"],
    ["Acme — Engineer  Mar 2020 – Feb 2024", "Engineer", "Acme", "Mar 2020", "Feb 2024"],
    ["Staff Engineer at Acme  2020-03 - Present", "Staff Engineer", "Acme", "2020-03", "Present"],
    ["Acme Corp - Product Manager (01/2019 to 12/2021)", "Product Manager", "Acme Corp", "01/2019", "12/2021"],
    ["Engineer @ Acme  2018–2020", "Engineer", "Acme", "2018", "2020"],
  ])("%s", (line, role, company, start, end) => {
    expect(first(line)).toMatchObject({ role, company, startDate: start, endDate: end });
  });

  it("merges a company line with the following role/date line", () => {
    const r = parseResumeText("Jane\nEXPERIENCE\nAcme Corp\nSenior Developer  2019 - 2021\n- Built it");
    expect(r.resume.experience).toHaveLength(1);
    expect(r.resume.experience[0]).toMatchObject({ company: "Acme Corp", role: "Senior Developer", startDate: "2019" });
  });

  it("separates entries on blank lines even without dates", () => {
    const r = parseResumeText("Jane\nEXPERIENCE\nDeveloper, Alpha\n- a.\n\nDeveloper, Beta\n- b.");
    expect(r.resume.experience).toHaveLength(2);
  });

  it("accepts every bullet marker and bare bullets", () => {
    const marks = ["•", "-", "*", "▪", "–", "●", "◦"];
    const text = ["Jane", "EXPERIENCE", "Engineer | Acme 2020 - 2021", ...marks.map((m, i) => `${m} item ${i}.`), "•bare"].join("\n");
    expect(parseResumeText(text).resume.experience[0]!.bullets).toHaveLength(marks.length + 1);
  });

  it("warns about bullets without a header", () => {
    const r = parseResumeText("Jane\nEXPERIENCE\n- orphan bullet");
    expect(r.warnings).toContain("Bullets were found before any role header.");
    expect(r.resume.experience[0]!.bullets).toHaveLength(1);
  });
});

describe("contact extraction", () => {
  const contactOf = (header: string) => parseResumeText(`${header}\nSKILLS\nGo`).resume.contact;

  it("normalizes bare linkedin/github URLs and keeps other safe URLs as website", () => {
    const c = contactOf("Jane Doe\nlinkedin.com/in/jane www.github.com/jane https://jane.dev/about");
    expect(c.linkedin).toBe("https://linkedin.com/in/jane");
    expect(c.github).toBe("https://www.github.com/jane");
    expect(c.website).toBe("https://jane.dev/about");
  });

  it("handles labelled fields and a bare personal domain", () => {
    const c = contactOf("Jane Doe\nEmail: jane@x.io\nPhone: 555-123-4567\nWebsite: jane.dev");
    expect(c).toMatchObject({ email: "jane@x.io", phone: "555-123-4567", website: "https://jane.dev" });
  });

  it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)"])("rejects %s", (bad) => {
    const r = parseResumeText(`Jane Doe\n${bad}\njane@x.io\nSKILLS\nGo`);
    expect(r.resume.contact.website).toBe("");
    expect(JSON.stringify(r.resume)).not.toMatch(/javascript:|vbscript:|data:text/i);
    expect(r.warnings.join(" ")).toMatch(/unsafe link/);
  });

  it("does not mistake tech names for websites", () => {
    const c = contactOf("Jane Doe\nASP.NET and Node.js developer");
    expect(c.website).toBe("");
    expect(c.headline).toBe("ASP.NET and Node.js developer");
  });

  it("keeps extra websites out of the contact block", () => {
    const r = parseResumeText("Jane Doe\nhttps://a.dev https://b.dev\nSKILLS\nGo");
    expect(r.resume.contact.website).toBe("https://a.dev");
    expect(r.unmappedLines).toContain("https://b.dev");
  });
});

describe("skills", () => {
  it("puts uncategorized lists in a default Skills group", () => {
    const r = parseResumeText("Jane\nSKILLS\nTypeScript, React | Node.js • Go\n- Docker");
    expect(r.resume.skills).toHaveLength(1);
    expect(r.resume.skills[0]!.category).toBe("Skills");
    expect(r.resume.skills[0]!.items).toEqual(["TypeScript", "React", "Node.js", "Go", "Docker"]);
  });

  it("joins wrapped category lines", () => {
    const r = parseResumeText("Jane\nSKILLS\nLanguages: Go, Rust,\nPython\nTools: Git");
    expect(r.resume.skills.map((g) => g.items)).toEqual([["Go", "Rust", "Python"], ["Git"]]);
  });
});

describe("education", () => {
  it("splits multiple entries and finds a single graduation year", () => {
    const r = parseResumeText("Jane\nEDUCATION\nMIT, Cambridge, MA\nM.S. Computer Science 2016\n\nState College\nBachelor of Arts 2012");
    expect(r.resume.education).toHaveLength(2);
    expect(r.resume.education[0]).toMatchObject({ institution: "MIT", degree: "M.S. Computer Science", endDate: "2016" });
    expect(r.resume.education[1]).toMatchObject({ institution: "State College", degree: "Bachelor of Arts", endDate: "2012" });
  });
});

describe("messy, minimal and empty input", () => {
  it.each(["", "   \n\n\t ", "-----\n=====", "•"])("handles empty input %j", (input) => {
    const r = parseResumeText(input);
    expect(validateResume(r.resume).ok).toBe(true);
    expect(r.warnings).toContain("No resume text was found.");
    expect(r.unmappedLines).toEqual([]);
    expect(r.detectedSections).toEqual([]);
  });

  it("reports missing sections and name/email for a bare paragraph", () => {
    const r = parseResumeText("I am a developer who likes building things and shipping them fast to real users every day.");
    expect(r.warnings).toEqual(
      expect.arrayContaining([
        "No section headings were found; only contact details were extracted.",
        "No Experience section was detected.",
        "No email address was found.",
      ]),
    );
    expect(validateResume(r.resume).ok).toBe(true);
  });

  it("collects unrecognized sections as unmapped lines", () => {
    const r = parseResumeText("Jane Doe\nSKILLS\nGo\nCERTIFICATIONS\nAWS Certified\nCKA\nEDUCATION\nMIT");
    expect(r.unmappedLines).toEqual(["CERTIFICATIONS", "AWS Certified", "CKA"]);
    expect(r.warnings).toContain('Unrecognized section "CERTIFICATIONS" was not imported.');
    expect(r.resume.education[0]!.institution).toBe("MIT");
  });

  it("strips control characters, HTML and invisible characters", () => {
    const r = parseResumeText("Jane\u0000 Doe\u200B\nEXPERIENCE\nEngineer | <b>Acme</b> 2020 - 2021\n- Did <script>alert(1)</script>things");
    expect(r.resume.contact.fullName).toBe("Jane Doe");
    expect(r.resume.experience[0]!.company).toBe("Acme");
    expect(r.resume.experience[0]!.bullets[0]!.text).not.toMatch(/</);
  });

  it("handles CRLF and tab-separated text", () => {
    const r = parseResumeText("Jane Doe\r\nEXPERIENCE\r\nEngineer\t|\tAcme\t2020 - 2021\r\n- Did it.\r\n");
    expect(r.resume.experience[0]).toMatchObject({ role: "Engineer", company: "Acme" });
  });
});

describe("limits", () => {
  it("clamps long fields and warns", () => {
    const long = "word ".repeat(400);
    const r = parseResumeText(`Jane\nSUMMARY\n${long}\nEXPERIENCE\nEngineer | Acme 2020 - 2021\n- ${long}`);
    expect(validateResume(r.resume).ok).toBe(true);
    expect(r.resume.experience[0]!.bullets[0]!.text.length).toBeLessThanOrEqual(600);
    expect(r.warnings.join(" ")).toMatch(/shortened/);
  });

  it("caps entries and bullets", () => {
    const bullets = Array.from({ length: 40 }, (_, i) => `- bullet ${i}.`).join("\n");
    const jobs = Array.from({ length: 50 }, (_, i) => `Engineer | Co${i} 2020 - 2021`).join("\n\n");
    const r = parseResumeText(`Jane\nEXPERIENCE\nEngineer | Acme 2020 - 2021\n${bullets}\n\n${jobs}`);
    expect(validateResume(r.resume).ok).toBe(true);
    expect(r.resume.experience.length).toBeLessThanOrEqual(30);
    expect(r.resume.experience[0]!.bullets).toHaveLength(20);
  });

  it("truncates oversized input", () => {
    const r = parseResumeText(`Jane\nSKILLS\n${"Go, ".repeat(100_000)}`);
    expect(r.warnings.join(" ")).toMatch(/very long/);
    expect(validateResume(r.resume).ok).toBe(true);
  });

  it("caps unmapped lines", () => {
    const r = parseResumeText(`Jane\nCERTIFICATIONS\n${Array.from({ length: 500 }, (_, i) => `cert ${i}`).join("\n")}`);
    expect(r.unmappedLines.length).toBeLessThanOrEqual(100);
  });
});

describe("robustness", () => {
  it("always yields a valid resume for pseudo-random garbage", () => {
    const pieces = ["EXPERIENCE", "SKILLS", "EDUCATION", "PROJECTS", "- ", "• ", "2020 - Present", "Acme | ", "<b>", "javascript:x", "a@b.co", "\u0000", "\n", "\n\n", " — ", "at ", "Tech: ", "https://x.dev", ",", ":", "University", "B.S."];
    let seed = 42;
    const next = () => (seed = (seed * 1664525 + 1013904223) % 4294967296);
    for (let i = 0; i < 300; i++) {
      let text = "";
      for (let j = 0; j < 40; j++) text += pieces[next() % pieces.length] + (next() % 3 === 0 ? "word" : "");
      const r = parseResumeText(text);
      expect(validateResume(r.resume).ok).toBe(true);
    }
  });

  it.each([
    ["email-like run", "a".repeat(100_000)],
    ["dotted labels", "a.".repeat(50_000)],
    ["digit/space run", "1 ".repeat(50_000)],
    ["unclosed tags", "<a".repeat(50_000)],
    ["at signs", "a@".repeat(50_000)],
    ["www runs", "www.".repeat(25_000)],
  ])("stays linear on %s", (_n, junk) => {
    for (const text of [junk, `Jane\n${junk}\nSKILLS\n${junk}`, `Jane\nEXPERIENCE\n${junk}`]) {
      const t = Date.now();
      expect(validateResume(parseResumeText(text).resume).ok).toBe(true);
      expect(Date.now() - t).toBeLessThan(1500);
    }
  });

  it("removes nested tag payloads completely", () => {
    const r = parseResumeText("Jane\nEXPERIENCE\nEngineer | Acme 2020 - 2021\n- Did <scr<script>ipt>alert(1)</scr</script>ipt>things");
    expect(r.resume.experience[0]!.bullets[0]!.text).not.toMatch(/</);
  });

  it("is fast on adversarial repeated input", () => {
    const t = Date.now();
    parseResumeText("EXPERIENCE\n" + "a - ".repeat(20000) + "\n" + "2020 -".repeat(5000));
    expect(Date.now() - t).toBeLessThan(2000);
  });
});
