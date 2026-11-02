# QR Canvas

QR codes you can draw on. Style the code, paint pixel art in its own module grid, and check live that the original text still decodes. Everything runs in the browser; nothing is uploaded.

## Develop

Needs Node 20.19+ or 22.12+.

```
npm install
npm run dev        # http://localhost:5173/qr-canvas/
npm test           # unit tests (Vitest)
npm run build      # typecheck + production build into dist/
npm run test:e2e   # browser tests against the production build (npx playwright install chromium first)
```

## Deploy to GitHub Pages

1. Push to a repository on GitHub with `main` as the default branch.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Every push to `main` runs the checks and publishes `dist/`.

The workflow builds with `BASE_PATH=/<repo name>/`. For a custom domain or a `<user>.github.io` repo, set `BASE_PATH: /` in `.github/workflows/deploy.yml` (and add `public/CNAME` for a custom domain).

## How the drawing check works

- Function patterns (finders, timing, alignment, format and version info) are locked.
- Each Reed–Solomon block repairs up to half its error-correction codewords. `src/lib/qr-layout.ts` maps every module to its codeword and block, so edits are counted per block.
- `src/lib/qr-verify.ts` also decodes the edited code with jsQR, plain and as styled, and compares the bytes with the original text.
- `src/lib/qr-layout.test.ts` checks the budget against the real decoder: damage up to the limit still reads, damage beyond it does not.
