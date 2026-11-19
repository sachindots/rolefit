import { describe, expect, it } from "vitest";
import { TEMPLATES } from "../components/preview/templates";
import { createSampleWorkspace } from "../data/sampleWorkspace";
import type { PageSize, ResumeData, TemplateId } from "../types/resume";
import {
  FORMAT_PROFILES,
  WORDS_PER_PAGE,
  checkFormatProfile,
  estimateResumePages,
  estimateYearsOfExperience,
  inspectTemplateMetrics,
  isReverseChronological,
  parseResumeDateMonth,
  type FormatProfileId,
} from "./formatProfiles";
import { createEmptyResume } from "./schema";

const FIXED_NOW = new Date("2026-06-15T00:00:00Z");

function makeSampleResume(): ResumeData {
  return createSampleWorkspace().resume;
}

function makeStrongSampleResume(): ResumeData {
  const resume = createSampleWorkspace().resume;
  resume.experience[0].bullets[3].text =
    "Reduced frontend regressions by 35% by introducing strict TypeScript lint rules and visual tests.";
  resume.experience[1].bullets[2].text =
    "Optimized service latency by 28% using query indexing and Redis caching.";
  return resume;
}

function makeWordFiller(wordCount: number): string {
  return Array.from({ length: wordCount }, (_, i) => `word${i}`).join(" ");
}

describe("parseResumeDateMonth", () => {
  it("parses month-year, ISO, slash, year-only, and Present dates", () => {
    expect(parseResumeDateMonth("Jan 2021", FIXED_NOW)).toBe(2021 * 12 + 0);
    expect(parseResumeDateMonth("Sept. 2020", FIXED_NOW)).toBe(2020 * 12 + 8);
    expect(parseResumeDateMonth("2022-03", FIXED_NOW)).toBe(2022 * 12 + 2);
    expect(parseResumeDateMonth("11/2019", FIXED_NOW)).toBe(2019 * 12 + 10);
    expect(parseResumeDateMonth("2018", FIXED_NOW)).toBe(2018 * 12);
    expect(parseResumeDateMonth("Present", FIXED_NOW)).toBe(2026 * 12 + 5);
    expect(parseResumeDateMonth("Current", FIXED_NOW)).toBe(2026 * 12 + 5);
  });

  it("returns null for empty or unparseable dates", () => {
    expect(parseResumeDateMonth("", FIXED_NOW)).toBeNull();
    expect(parseResumeDateMonth("Sometime ago", FIXED_NOW)).toBeNull();
    expect(parseResumeDateMonth("13/2021", FIXED_NOW)).toBeNull();
  });
});

describe("estimateYearsOfExperience", () => {
  it("sums non-overlapping ranges and merges overlapping concurrent roles", () => {
    const nonOverlapping = [
      { id: "1", company: "A", role: "R", location: "", startDate: "Jan 2022", endDate: "Jan 2024", bullets: [] },
      { id: "2", company: "B", role: "R", location: "", startDate: "Jan 2020", endDate: "Jan 2021", bullets: [] },
    ];
    expect(estimateYearsOfExperience(nonOverlapping, FIXED_NOW)).toBe(3);

    const overlapping = [
      { id: "1", company: "A", role: "R", location: "", startDate: "Jan 2020", endDate: "Jan 2024", bullets: [] },
      { id: "2", company: "B", role: "R", location: "", startDate: "Jan 2021", endDate: "Jan 2023", bullets: [] },
    ];
    expect(estimateYearsOfExperience(overlapping, FIXED_NOW)).toBe(4);
  });

  it("ignores inverted or unparseable ranges and returns null when none are valid", () => {
    expect(
      estimateYearsOfExperience(
        [{ id: "1", company: "A", role: "R", location: "", startDate: "2024", endDate: "2020", bullets: [] }],
        FIXED_NOW,
      ),
    ).toBeNull();
    expect(estimateYearsOfExperience([], FIXED_NOW)).toBeNull();
  });
});

describe("isReverseChronological", () => {
  it("detects ordered, out-of-order, and unparseable experience lists", () => {
    expect(
      isReverseChronological(
        [
          { id: "1", company: "A", role: "R", location: "", startDate: "Jan 2023", endDate: "Present", bullets: [] },
          { id: "2", company: "B", role: "R", location: "", startDate: "Jan 2020", endDate: "Dec 2022", bullets: [] },
        ],
        FIXED_NOW,
      ),
    ).toEqual({ ordered: true, comparableCount: 2 });

    expect(
      isReverseChronological(
        [
          { id: "1", company: "A", role: "R", location: "", startDate: "Jan 2018", endDate: "Dec 2020", bullets: [] },
          { id: "2", company: "B", role: "R", location: "", startDate: "Jan 2021", endDate: "Present", bullets: [] },
        ],
        FIXED_NOW,
      ),
    ).toEqual({ ordered: false, comparableCount: 2 });

    expect(
      isReverseChronological(
        [
          { id: "1", company: "A", role: "R", location: "", startDate: "TBD", endDate: "", bullets: [] },
          { id: "2", company: "B", role: "R", location: "", startDate: "Earlier", endDate: "", bullets: [] },
        ],
        FIXED_NOW,
      ),
    ).toEqual({ ordered: true, comparableCount: 0 });
  });
});

describe("estimateResumePages", () => {
  it("returns 0 pages for empty resume and scales with template density and page size", () => {
    const empty = createEmptyResume();
    const emptyEst = estimateResumePages(empty, { template: "classic-executive", pageSize: "letter" });
    expect(emptyEst.estimatedPages).toBe(0);
    expect(emptyEst.isEstimate).toBe(true);
    expect(emptyEst.wordsPerPage).toBe(WORDS_PER_PAGE["classic-executive"].letter);

    const medium = createEmptyResume();
    medium.summary = makeWordFiller(500);

    const classicLetter = estimateResumePages(medium, { template: "classic-executive", pageSize: "letter" });
    const compactLetter = estimateResumePages(medium, { template: "technical-compact", pageSize: "letter" });
    const classicA4 = estimateResumePages(medium, { template: "classic-executive", pageSize: "a4" });

    expect(classicLetter.estimatedPages).toBe(2);
    expect(compactLetter.estimatedPages).toBe(1);
    expect(classicA4.wordsPerPage).toBeGreaterThan(classicLetter.wordsPerPage);
  });
});

describe("inspectTemplateMetrics", () => {
  it("reads font size, margins, and single-column status directly from TEMPLATES", () => {
    const classic = inspectTemplateMetrics(TEMPLATES["classic-executive"]);
    expect(classic.fontSizePt).toBe(9.75);
    expect(classic.marginXIn).toBe(0.42);
    expect(classic.isMultiColumn).toBe(false);

    const compact = inspectTemplateMetrics(TEMPLATES["technical-compact"]);
    expect(compact.fontSizePt).toBe(9);
    expect(compact.marginXIn).toBe(0.33);
    expect(compact.isMultiColumn).toBe(false);

    const flagged = inspectTemplateMetrics(TEMPLATES["modern-minimal"], true);
    expect(flagged.isMultiColumn).toBe(true);
  });
});

describe("checkFormatProfile — harvard", () => {
  it("verifies all S4 Harvard checks including reverse-chron, education order, pronouns, bullet limits, font/margins, graphics, multipage footer, and PDF", () => {
    const sampleWarn = checkFormatProfile(
      makeSampleResume(),
      { template: "classic-executive", pageSize: "letter" },
      "harvard",
      FIXED_NOW,
    );
    // Sample workspace intentionally includes "Responsible for" and "Worked on" bullets
    expect(sampleWarn.checks.find((c) => c.id === "harvard-action-verbs")?.status).toBe("warn");

    const resume = makeStrongSampleResume();
    const res = checkFormatProfile(
      resume,
      { template: "classic-executive", pageSize: "letter" },
      "harvard",
      FIXED_NOW,
    );

    const byId = Object.fromEntries(res.checks.map((c) => [c.id, c]));
    expect(byId["harvard-reverse-chronological"].status).toBe("pass");
    expect(byId["harvard-education-order"].status).toBe("pass");
    expect(byId["harvard-action-verbs"].status).toBe("pass");
    expect(byId["harvard-no-first-person"].status).toBe("pass");
    expect(byId["harvard-bullet-length"].status).toBe("pass");
    expect(byId["harvard-bullets-per-role"].status).toBe("pass");
    expect(byId["harvard-font-margins"].status).toBe("warn");
    expect(byId["harvard-no-photo-graphics"].status).toBe("pass");
    expect(byId["harvard-multipage-footer"].status).toBe("pass");
    expect(byId["harvard-pdf-output"].status).toBe("pass");
    expect(byId["harvard-bullets-per-role"].sourceKind).toBe("convention");
    expect(byId["harvard-no-first-person"].sourceKind).toBe("official");
  });

  it("flags first-person pronouns (without false-positiving on uppercase US), >4 bullets per role, long bullets, photos, <5 yrs education order, and >1 page footer", () => {
    const resume = createEmptyResume();
    resume.contact.fullName = "Junior Dev";
    resume.contact.website = "https://cdn.example.com/headshot.png";
    resume.summary = "Built US payment APIs for enterprise banks. " + makeWordFiller(460);
    resume.experience = [
      {
        id: "e1",
        company: "EarlyCo",
        role: "Engineer",
        location: "Boston, MA",
        startDate: "Jan 2024",
        endDate: "Jan 2026",
        bullets: [
          { id: "b1", text: "I built the checkout pipeline for US customers." },
          { id: "b2", text: "Responsible for maintaining servers." },
          { id: "b3", text: "Delivered " + "a".repeat(225) },
          { id: "b4", text: "Scaled Redis cluster by 2x." },
          { id: "b5", text: "Automated CI tests across 5 repos." },
        ],
      },
    ];
    resume.education = [
      {
        id: "ed1",
        institution: "Harvard",
        degree: "B.A. CS",
        location: "Cambridge, MA",
        startDate: "2020",
        endDate: "2024",
        details: "",
      },
    ];

    const res = checkFormatProfile(
      resume,
      { template: "classic-executive", pageSize: "letter" },
      "harvard",
      FIXED_NOW,
    );
    const byId = Object.fromEntries(res.checks.map((c) => [c.id, c]));

    expect(byId["harvard-education-order"].status).toBe("warn");
    expect(byId["harvard-no-first-person"].status).toBe("fail");
    expect(byId["harvard-bullet-length"].status).toBe("warn");
    expect(byId["harvard-bullets-per-role"].status).toBe("warn");
    expect(byId["harvard-no-photo-graphics"].status).toBe("fail");
    expect(byId["harvard-multipage-footer"].status).toBe("warn");

    // Verify uppercase "US" alone does NOT trigger first-person pronoun check
    const usOnly = makeSampleResume();
    usOnly.summary = "Expanded US and EU payment rails.";
    const usRes = checkFormatProfile(
      usOnly,
      { template: "classic-executive", pageSize: "letter" },
      "harvard",
      FIXED_NOW,
    );
    expect(usRes.checks.find((c) => c.id === "harvard-no-first-person")?.status).toBe("pass");
  });
});

describe("checkFormatProfile — london-uk", () => {
  it("checks A4 vs Letter, protected UK fields, page caps, reverse-chron, and achievement-led bullets", () => {
    const resume = makeStrongSampleResume();
    const a4Res = checkFormatProfile(
      resume,
      { template: "modern-minimal", pageSize: "a4" },
      "london-uk",
      FIXED_NOW,
    );
    const a4ById = Object.fromEntries(a4Res.checks.map((c) => [c.id, c]));
    expect(a4ById["uk-a4-page-size"].status).toBe("pass");
    expect(a4ById["uk-no-protected-fields"].status).toBe("pass");
    expect(a4ById["uk-page-length"].status).toBe("pass");
    expect(a4ById["uk-reverse-chronological"].status).toBe("pass");
    expect(a4ById["uk-action-bullets"].status).toBe("pass");

    const letterRes = checkFormatProfile(
      resume,
      { template: "modern-minimal", pageSize: "letter" },
      "london-uk",
      FIXED_NOW,
    );
    expect(letterRes.checks.find((c) => c.id === "uk-a4-page-size")?.status).toBe("warn");

    // Protected fields + >2 pages fail
    const badUk = createEmptyResume();
    badUk.summary = "Date of birth: 01/02/1995. Nationality: British. Marital status: Single. " + makeWordFiller(1100);
    const badRes = checkFormatProfile(
      badUk,
      { template: "modern-minimal", pageSize: "a4" },
      "london-uk",
      FIXED_NOW,
    );
    const badById = Object.fromEntries(badRes.checks.map((c) => [c.id, c]));
    expect(badById["uk-no-protected-fields"].status).toBe("fail");
    expect(badById["uk-no-protected-fields"].message).toMatch(/date of birth/i);
    expect(badById["uk-no-protected-fields"].message).toMatch(/nationality/i);
    expect(badById["uk-no-protected-fields"].message).toMatch(/marital status/i);
    expect(badById["uk-page-length"].status).toBe("fail");
  });

  it("warns on 2 pages when under 5 years of experience", () => {
    const resume = createEmptyResume();
    resume.summary = makeWordFiller(550);
    resume.experience = [
      {
        id: "e1",
        company: "LondonTech",
        role: "Analyst",
        location: "London, UK",
        startDate: "Jan 2023",
        endDate: "Jan 2026",
        bullets: [{ id: "b1", text: "Increased conversion by 18% through A/B testing." }],
      },
    ];
    const res = checkFormatProfile(
      resume,
      { template: "modern-minimal", pageSize: "a4" },
      "london-uk",
      FIXED_NOW,
    );
    expect(res.checks.find((c) => c.id === "uk-page-length")?.status).toBe("warn");
  });
});

describe("checkFormatProfile — faang", () => {
  it("checks single-column, page length (<10 yrs vs 10+ yrs), >=60% quantified bullets, XYZ count, skills, and no tables/images", () => {
    const resume = makeSampleResume();
    const res = checkFormatProfile(
      resume,
      { template: "technical-compact", pageSize: "letter" },
      "faang",
      FIXED_NOW,
    );
    const byId = Object.fromEntries(res.checks.map((c) => [c.id, c]));
    expect(byId["faang-single-column"].status).toBe("pass");
    expect(byId["faang-page-length"].status).toBe("pass");
    expect(byId["faang-quantified-bullets"].status).toBe("pass");
    expect(byId["faang-xyz-bullets"].status).toBe("pass");
    expect(byId["faang-skills-section"].status).toBe("pass");
    expect(byId["faang-no-tables-images"].status).toBe("pass");

    // Multi-column flag fails
    const multiCol = checkFormatProfile(
      resume,
      { template: "technical-compact", pageSize: "letter", multiColumn: true },
      "faang",
      FIXED_NOW,
    );
    expect(multiCol.checks.find((c) => c.id === "faang-single-column")?.status).toBe("fail");

    // 2 pages fails under 10 yrs, passes at 10+ yrs
    const twoPageJunior = createEmptyResume();
    twoPageJunior.summary = makeWordFiller(650);
    twoPageJunior.experience = [
      {
        id: "e1",
        company: "Co",
        role: "SWE",
        location: "",
        startDate: "Jan 2021",
        endDate: "Jan 2026",
        bullets: [
          { id: "b1", text: "Reduced p99 latency by 45% by migrating cache to Redis." },
          { id: "b2", text: "Worked on internal dashboard." },
          { id: "b3", text: "Maintained docs." },
        ],
      },
    ];
    const juniorRes = checkFormatProfile(
      twoPageJunior,
      { template: "technical-compact", pageSize: "letter" },
      "faang",
      FIXED_NOW,
    );
    expect(juniorRes.checks.find((c) => c.id === "faang-page-length")?.status).toBe("fail");
    expect(juniorRes.checks.find((c) => c.id === "faang-quantified-bullets")?.status).toBe("fail");
    expect(juniorRes.checks.find((c) => c.id === "faang-skills-section")?.status).toBe("fail");
    expect(juniorRes.xyzBulletCount).toBe(1);
    expect(juniorRes.checks.find((c) => c.id === "faang-xyz-bullets")?.status).toBe("pass");

    // 10+ years allows 2 pages
    twoPageJunior.experience[0].startDate = "Jan 2015";
    const seniorRes = checkFormatProfile(
      twoPageJunior,
      { template: "technical-compact", pageSize: "letter" },
      "faang",
      FIXED_NOW,
    );
    expect(seniorRes.checks.find((c) => c.id === "faang-page-length")?.status).toBe("pass");

    // Table markup fails
    twoPageJunior.summary += " <table><tr><td>x</td></tr></table>";
    const tableRes = checkFormatProfile(
      twoPageJunior,
      { template: "technical-compact", pageSize: "letter" },
      "faang",
      FIXED_NOW,
    );
    expect(tableRes.checks.find((c) => c.id === "faang-no-tables-images")?.status).toBe("fail");
  });
});

describe("property-based invariants (S8 & S11)", () => {
  function createRng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  const PROFILES: FormatProfileId[] = ["harvard", "london-uk", "faang"];
  const TEMPLATE_IDS: TemplateId[] = ["classic-executive", "modern-minimal", "technical-compact"];
  const PAGE_SIZE_IDS: PageSize[] = ["letter", "a4"];
  const SAMPLE_STRINGS = [
    "",
    "Built distributed system cutting latency by 40% using Go.",
    "I was responsible for helping with tasks.",
    "Date of birth: 1990-01-01",
    "<table><tr><td>cell</td></tr></table>",
    "https://example.com/photo.jpg",
    "a".repeat(260),
    "Jan 2020",
    "Present",
    "2010",
    "invalid-date",
    "🚀 Unicode résumé — 100% tested",
  ];

  it("keeps score strictly within 0-100 and valid metadata for 240 arbitrary generated resumes", () => {
    const rng = createRng(42);
    const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
    const randInt = (max: number) => Math.floor(rng() * (max + 1));

    for (let i = 0; i < 240; i++) {
      const resume: ResumeData = {
        contact: {
          fullName: pick(SAMPLE_STRINGS),
          headline: pick(SAMPLE_STRINGS),
          email: pick(SAMPLE_STRINGS),
          phone: pick(SAMPLE_STRINGS),
          location: pick(SAMPLE_STRINGS),
          website: pick(SAMPLE_STRINGS),
          linkedin: pick(SAMPLE_STRINGS),
          github: pick(SAMPLE_STRINGS),
        },
        summary: pick(SAMPLE_STRINGS),
        experience: Array.from({ length: randInt(5) }, (_, idx) => ({
          id: `e-${idx}`,
          company: pick(SAMPLE_STRINGS),
          role: pick(SAMPLE_STRINGS),
          location: pick(SAMPLE_STRINGS),
          startDate: pick(SAMPLE_STRINGS),
          endDate: pick(SAMPLE_STRINGS),
          bullets: Array.from({ length: randInt(6) }, (_, bIdx) => ({
            id: `b-${idx}-${bIdx}`,
            text: pick(SAMPLE_STRINGS),
          })),
        })),
        projects: Array.from({ length: randInt(3) }, (_, idx) => ({
          id: `p-${idx}`,
          name: pick(SAMPLE_STRINGS),
          link: pick(SAMPLE_STRINGS),
          description: pick(SAMPLE_STRINGS),
          technologies: Array.from({ length: randInt(4) }, () => pick(SAMPLE_STRINGS)),
          bullets: Array.from({ length: randInt(3) }, (_, bIdx) => ({
            id: `pb-${idx}-${bIdx}`,
            text: pick(SAMPLE_STRINGS),
          })),
        })),
        skills: Array.from({ length: randInt(3) }, (_, idx) => ({
          id: `s-${idx}`,
          category: pick(SAMPLE_STRINGS),
          items: Array.from({ length: randInt(5) }, () => pick(SAMPLE_STRINGS)),
        })),
        education: Array.from({ length: randInt(2) }, (_, idx) => ({
          id: `ed-${idx}`,
          institution: pick(SAMPLE_STRINGS),
          degree: pick(SAMPLE_STRINGS),
          location: pick(SAMPLE_STRINGS),
          startDate: pick(SAMPLE_STRINGS),
          endDate: pick(SAMPLE_STRINGS),
          details: pick(SAMPLE_STRINGS),
        })),
      };

      const profileId = PROFILES[i % PROFILES.length];
      const template = TEMPLATE_IDS[i % TEMPLATE_IDS.length];
      const pageSize = PAGE_SIZE_IDS[i % PAGE_SIZE_IDS.length];
      const multiColumn = rng() < 0.15;

      const result = checkFormatProfile(
        resume,
        { template, pageSize, multiColumn },
        profileId,
        FIXED_NOW,
      );

      expect(result.profile).toEqual(FORMAT_PROFILES[profileId]);
      expect(Number.isInteger(result.score)).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.counts.pass + result.counts.warn + result.counts.fail).toBe(result.counts.total);
      expect(result.counts.total).toBe(result.checks.length);
      expect(result.pageEstimate.isEstimate).toBe(true);
      expect(result.pageEstimate.estimatedPages).toBeGreaterThanOrEqual(0);

      for (const check of result.checks) {
        expect(["pass", "warn", "fail"]).toContain(check.status);
        expect(["official", "convention"]).toContain(check.sourceKind);
        expect(check.source.trim().length).toBeGreaterThan(0);
        expect(check.message.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
