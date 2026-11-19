# RoleFit — Private ATS Resume Builder & JD Match Studio

RoleFit is a local-first resume builder and job-description match studio that runs entirely in the browser. It pairs a structured resume editor with a live US Letter / A4 document preview, three single-column ATS-safe templates, deterministic job-description keyword matching, per-bullet impact auditing, and hardened JSON backup export/import.

## Features

- **Structured Resume Editor:** Edit Contact & Links, Professional Summary (with live word and character counts), Work Experience, Projects, Grouped Skills, and Education with add, remove, and keyboard-accessible up/down reordering.
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

## Privacy Architecture

- **Local-Only Persistence:** All workspace state is stored under `rolefit.workspace.v1` in browser `localStorage` with schema validation and automatic recovery if stored JSON is corrupted.
- **Zero Network Calls:** RoleFit makes no external API calls, uses no analytics or telemetry, and loads no runtime CDN fonts or scripts.

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
