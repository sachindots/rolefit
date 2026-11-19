# RoleFit — Private ATS Resume Builder & JD Match Studio

RoleFit is a local-first resume builder and job-description match studio that runs in the browser. It pairs a structured resume editor with a live US Letter / A4 document preview, three single-column ATS-safe templates, deterministic job-description keyword matching, per-bullet impact auditing, hardened JSON backup export/import, and an opt-in Gemini BYOK (Bring Your Own Key) per-section AI Tailor with a zero-key prompt export fallback.

## Features

- **Structured Resume Editor:** Edit Contact & Links, Professional Summary (with live word and character counts), Work Experience, Projects, Grouped Skills, and Education with add, remove, and keyboard-accessible up/down reordering.
- **Per-Section Gemini AI Tailor & Before/After Diff Modal:**
  - **Target Sections:** Trigger **Tailor with AI** on Professional Summary, any Experience role, any Project, or Skills.
  - **Company-Type Calibration:** Tune rewrites for **General**, **Big Tech**, **Startup**, **Enterprise**, **Agency**, or **Non-Technical** hiring readers, plus an optional 300-character custom steering instruction.
  - **4-Part Senior Recruiter Review Layout:**
    1. **Before / After Diff Preview:** Side-by-side comparison highlighting any `[NEED: ...]` metric placeholders where real numbers are needed.
    2. **Key Changes & Why:** Bullet-by-bullet rationale explaining how each edit improves ATS alignment and recruiter readability.
    3. **Missing Numbers Needed:** Numbered checklist of every `[NEED: ...]` metric placeholder to fill in with real figures.
    4. **3-Line Recruiter Scan Test:** Summarizes `Who`, `Seniority`, and `Why This Job` from a 6-second human scan, plus an optional plain `qualificationNote` if the resume is underqualified for the target JD.
  - **Strict Anti-Fabrication & Explicit Consent:** Rejects responses that invent numbers or skills not present in your resume, and never mutates your workspace until you click **Accept Rewrite**.
- **Zero-Key "Copy Tailored Prompt" Demo Mode:** When no Gemini API key is configured, clicking **Tailor with AI** opens a zero-key fallback with a 1-click **Copy Tailored Prompt** button (combining the Senior Recruiter system rubric, company calibration, missing JD keywords, section ATS findings, and delimited section content) ready to paste into ChatGPT, Claude, or Gemini web chat.
- **Live Split-Pane Preview & 3 ATS-Safe Templates:**
  - **Classic Executive:** Serif headings, clean horizontal dividers, and traditional corporate layout.
  - **Modern Minimal:** Sans-serif hierarchy with generous whitespace for product, design, and engineering roles.
  - **Technical Compact:** High-density single-column layout with scannable skill categories and compact metadata rows.
- **US Letter & A4 Print-to-PDF Export:** Dedicated `@media print` and `@page` rules strip studio chrome and export real selectable text for ATS parsers (`window.print()`).
- **Deterministic JD Match Engine:** Extracts and matches single-word and multi-word technical terms, including symbol-bearing tokens (`C++`, `C#`, `.NET`, `Node.js`, `CI/CD`, `REST/GraphQL`) and common aliases (`k8s` ↔ `Kubernetes`, `ts` ↔ `TypeScript`, `postgres` ↔ `PostgreSQL`). Displays a 0–100% match score plus clickable matched and missing keyword chips.
- **Bullet-Impact & ATS Audit:** Flags weak or passive bullet openings (`"Responsible for"`, `"Worked on"`, `"Helped"`), bullets missing measurable outcomes, overly short or long bullets, and missing contact or section data with role/project context and suggested fixes.
- **Hardened JSON Backup Export & Import:** Exports versioned `.json` backups (`schemaVersion: 1`) and validates imports against payload size limits (`512 KB`), nesting depth limits, prototype-pollution keys (`__proto__`, `constructor`, `prototype`), HTML/script tags, and unsafe URL schemes (allowing only `http:`, `https:`, and `mailto:`).
- **Studio Dark / Light Mode:** Toggle dark or light studio chrome (persisted in `localStorage`) while keeping the printable resume sheet white (`bg-white text-slate-900`) for accurate print previewing.
- **First-Visit Sample Workspace & Safe Resets:** Preloads a sample resume and target job description on first visit so the preview, match score, and audit findings are active immediately. **Load sample** and **Start blank** actions are guarded by keyboard-accessible confirmation modals (`role="dialog"`, `aria-modal="true"`, Escape to close, focus trap and restoration).

## Resume Upload & Extraction

- **Supported Formats:** Upload existing `.pdf`, `.docx`, or `.txt` resumes via drag-and-drop or file picker from **Upload Resume** in the studio header.
- **100% Client-Side Extraction & Hardening:** Files are extracted and parsed directly in your browser with a `5 MB` file size limit, magic-byte signature validation, PDF page cap, and DOCX zip-bomb, entry-count, and XML size checks. Nothing is sent over the network during local extraction.
- **Review-Before-Import Modal:** Before replacing your active resume, inspect extracted Contact fields, Summary preview, Experience, Projects, Skills, and Education counts, along with any extraction warnings (such as scanned PDFs or truncated fields) and a collapsible **Unmapped lines** list. Clicking **Apply to Editor** replaces only the resume fields while keeping your job description, template, page size, and theme intact.
- **Optional Gemini-Enhanced Extraction:** When a Gemini API key is configured in **AI Settings**, you can explicitly click **Enhance extraction with Gemini** inside the review modal to structure complex or multi-column layouts. Output is validated against the same strict schema and anti-fabrication checks, and any error leaves your local parsed draft intact.

## Privacy Architecture & Gemini BYOK

- **Honest Privacy Badge:**
  - Displays **`Local-only · Zero tracking`** when no Gemini API key is configured. In this default state, RoleFit makes zero external network requests.
  - Automatically updates to **`Local-first · AI via Gemini (on click)`** when a user or local dev Gemini API key is active.
- **Browser-Direct BYOK Storage:**
  - In **AI Settings**, API keys default to **`Session only — clears on tab close`** (`sessionStorage` under `rolefit.ai.v1`), with an explicit opt-in **`Remember on this device (localStorage)`** option and a 1-click **Clear key** button.
  - Select between `gemini-3.8-flash` (default), `gemini-3.7-flash`, and `gemini-2.5-flash`.
  - When you click **Generate Rewrite**, your browser sends the request directly to `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent` via the `x-goog-api-key` header. No RoleFit backend exists.
- **Local Dev `.env.local` Support (Never Bundled in Production):**
  - For local development only, you can create an untracked `.env.local` file in the repo root:
    ```bash
    VITE_GEMINI_API_KEY=your_gemini_api_key_here
    ```
  - `src/lib/aiSettings.ts` reads `import.meta.env.DEV ? import.meta.env.VITE_GEMINI_API_KEY : undefined` via a literal `import.meta.env.DEV` ternary so Vite dead-code-eliminates the environment branch in production builds (`npm run build` / GitHub Pages). Additionally, `AiSettingsModal` masks `source === "dev-env"` keys and never renders the raw dev key in the DOM.

## Local Development

```bash
npm ci
npm run dev        # starts Vite dev server on http://localhost:${PORT:-5173}
```

## Verification & Production Builds

```bash
npm run typecheck                  # TypeScript strict check (tsc --noEmit)
npm test                           # Vitest unit and component test suite
npm run build                      # Production build to dist/
GITHUB_PAGES=true npm run build    # GitHub Pages build with /rolefit/ base path
```

## ATS & Print-to-PDF Workflow

1. Select a template (**Classic Executive**, **Modern Minimal**, or **Technical Compact**) and paper size (**Letter** or **A4**) in the preview toolbar.
2. Click **Export PDF** (or press `Ctrl+P` / `Cmd+P`).
3. In the browser print dialog, choose **Save as PDF** with margins set to **Default** or **None**.
4. For automated UI verification inside the verifier container, use the globally preinstalled Playwright CLI (`playwright screenshot ...`) rather than adding `playwright` to `package.json`.
