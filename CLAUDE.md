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
- **Prices are scraped from suppliers** (Swedish building merchants).
  **Bauhaus** done (2026-11-16): `scripts/fetch-prices.ts` +
  `scripts/suppliers/bauhaus.ts` read category pages (robots.txt allows
  them and `?p=` pagination; it disallows `/api/`, search and other query
  strings) and write `public/prices/bauhaus.json` (`SupplierPriceFile`).
  Product cards carry `data-name` / `data-price` (per piece, incl. VAT);
  sizes are parsed from the name. Bauhaus has no website terms beyond
  köpvillkor/GDPR/cookies (checked 2026-11-16). Stay polite: one request at
  a time, 2 s apart, ~16 requests per run. The deploy workflow runs it on
  every build and weekly; failure keeps the committed file.
  On-demand fetching from the browser is impossible (bauhaus.se sends no
  CORS headers); the owner chose (2026-11-16) to keep the weekly fetch and
  show each price's age instead (`PriceAge`, warning after `STALE_DAYS`=14).
  **Hornbach is not scraped**: it serves a bot-protection "Client
  Challenge" even for robots.txt — do not try to get around it.
  Precedence per profile: own "Egen" price → supplier prices (cheapest
  wins) → clearly-labelled fake "Exempel" prices. Never present example
  prices as real. Supplier entries also define the stock lengths/sheet
  sizes used for the shopping list.
- Local runs need `NODE_USE_ENV_PROXY=1 npm run prices` in the cloud
  container (Node's fetch ignores HTTPS_PROXY otherwise).
- Stack: React + TS + Vite, react-three-fiber/drei, Zustand (persisted to
  localStorage). No backend: supplier prices are static JSON built in CI.

## Model conventions

- All lengths in **millimetres**, scene units are mm too.
- Part local geometry: length along X, thickness along Y, width along Z,
  origin at a corner. Rotation is quarter turns per axis (always
  axis-aligned). `rotatePart` keeps the bounding-box min corner fixed.
- Profile ids are `<category>-<t>x<w>` (boards) and `<category>-<t>`
  (sheets); stock lengths and sheet sizes in `catalog.ts` are typical
  values, not verified per supplier.
- Sheets are nested with a guillotine best-short-side-fit packer
  (`packSheets`), rotation allowed, grain ignored; every sheet size on offer
  is tried and the cheapest result kept.
- Boards: `packCuts` tries each stock length as bin size with first-fit and
  a subset-sum "best fill", then gives each board its cheapest fitting
  length; keeps the cheapest total (without prices: least timber).
- Snapping while dragging: grid via TransformControls `translationSnap`,
  then `snapOffset` pulls faces to nearby parts' faces on the dragged axis.
- Printing: `window.print()` with a print-only `PrintReport`; the 3D
  snapshot needs `preserveDrawingBuffer` and is taken with overlays hidden
  (drei `Html` labels are DOM, not in the canvas).
- Deploy: GitHub Pages via Actions on push to `main`; `vite base: './'`.

## Commands

`npm run dev`, `npm test` (vitest, logic in `src/lib/`), `npm run build`
(also type-checks).
