# Snickerei

Web CAD for **hobby woodworkers**. UI language: **Swedish** (code and
comments in English).

## Product decisions (from the owner, 2026-11-16)

- **Main device is a mobile phone** (2026-11-16). Design phone-first: bottom
  sheet + tab bar under 800 px, ≥40 px touch targets, 16 px inputs (no iOS
  zoom), −/+ nudge buttons instead of relying on precise dragging. Test with
  Playwright `devices['Pixel 7']`.
- **Free-form modelling with parametric parts**: parts are placed freely in
  3D, but a part's cross-section is fixed by its profile — a 45x70 can only
  be a 45x70. Only length (and position/rotation) is editable. Sheet goods
  (`kind: 'sheet'`) have a fixed thickness and free length/width (`part.width`).
- **Prices are to be scraped from suppliers** (Swedish building merchants).
  Not built yet. `PriceEntry` in `src/lib/types.ts` is the shape scraped
  data should take (per löpmeter or per piece at a length). Until then the
  app ships clearly-labelled fake "Exempel" prices plus hand-entered "Egen"
  prices. Never present example prices as real. Check each site's terms and
  robots.txt before scraping; scraping needs a server (CORS).
- Stack: React + TS + Vite, react-three-fiber/drei, Zustand (persisted to
  localStorage). No backend yet.

## Model conventions

- All lengths in **millimetres**, scene units are mm too.
- Part local geometry: length along X, thickness along Y, width along Z,
  origin at a corner. Rotation is quarter turns per axis (always
  axis-aligned). `rotatePart` keeps the bounding-box min corner fixed.
- Profile ids are `<category>-<t>x<w>` (boards) and `<category>-<t>`
  (sheets); stock lengths and sheet sizes in `catalog.ts` are typical
  values, not verified per supplier.
- Sheets are nested with a guillotine best-short-side-fit packer
  (`packSheets`), rotation allowed, grain ignored.
- Snapping while dragging: grid via TransformControls `translationSnap`,
  then `snapOffset` pulls faces to nearby parts' faces on the dragged axis.
- Printing: `window.print()` with a print-only `PrintReport`; the 3D
  snapshot needs `preserveDrawingBuffer` and is taken with overlays hidden
  (drei `Html` labels are DOM, not in the canvas).
- Deploy: GitHub Pages via Actions on push to `main`; `vite base: './'`.

## Commands

`npm run dev`, `npm test` (vitest, logic in `src/lib/`), `npm run build`
(also type-checks).
