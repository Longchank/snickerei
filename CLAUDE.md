# Snickerei

Web CAD for **hobby woodworkers**. UI language: **Swedish** (code and
comments in English).

## Product decisions (from the owner, 2026-11-16)

- **Free-form modelling with parametric parts**: parts are placed freely in
  3D, but a part's cross-section is fixed by its profile — a 45x70 can only
  be a 45x70. Only length (and position/rotation) is editable.
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
- Profile ids are `<category>-<t>x<w>`; stock lengths in `catalog.ts` are
  typical values, not verified per supplier.

## Commands

`npm run dev`, `npm test` (vitest, logic in `src/lib/`), `npm run build`
(also type-checks).
