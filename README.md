# RoleFit

Private, local-first ATS Resume Builder & Job Description Match Studio — split-pane WYSIWYG resume editor, ATS-safe templates, print-ready PDF export, and client-side job-description keyword & impact analysis.

## Development

```bash
npm install
npm run dev        # starts Vite on http://localhost:${PORT:-5173}
```

## Checks

```bash
npm run typecheck
npm test
npm run build
```

For automated UI verification inside the verifier container, use the globally preinstalled Playwright CLI (`playwright screenshot ...`) rather than adding `playwright` to `package.json`.
