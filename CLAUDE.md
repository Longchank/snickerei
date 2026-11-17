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
  every build and weekly. **The price file is not committed** (gitignored,
  decided 2026-11-17, to avoid redistributing the data via a public repo);
  a failed fetch publishes without shop prices. Public-facing stance: facts
  only (name, size, price), small subset, link back, non-commercial, no
  affiliation, stop on request (README "Om prisuppgifterna"). The legal
  risk to watch is the EU database right / URL §49 catalogue protection
  (repeated extraction + republication); get legal advice before any
  commercial use. Code is MIT-licensed; the licence doesn't cover price data.
  On-demand fetching from the browser is impossible (bauhaus.se sends no
  CORS headers); the owner chose (2026-11-16) to keep the weekly fetch and
  show each price's age instead (`PriceAge`, warning after `STALE_DAYS`=14).
  **Hornbach is not scraped**: it serves a bot-protection "Client
  Challenge" even for robots.txt — do not try to get around it.
  Precedence per profile: own "Egen" price → supplier prices (cheapest
  wins) → clearly-labelled fake "Exempel" prices. Never present example
  prices as real. Supplier entries also define the stock lengths/sheet
  sizes used for the shopping list.
- Local runs need `npm run prices` once to have shop prices (in a proxied
  cloud container: `NODE_USE_ENV_PROXY=1`, as Node's fetch ignores
  HTTPS_PROXY otherwise).
- Stack: React + TS + Vite, react-three-fiber/drei, Zustand (persisted to
  localStorage). No backend: supplier prices are static JSON built in CI.

## Workflow (owner, 2026-11-16)

- **Push directly to `main`** — no pull requests needed. Fetch first and
  only fast-forward; never force-push `main`. A push to `main` triggers the
  GitHub Pages deploy (and a price fetch).
- **No session links in commit messages** (owner, 2026-11-17): don't add a
  `Claude-Session:` trailer (or any claude.ai link) — the repo is going
  public. `Co-Authored-By: Claude …` is fine. Older commits keep theirs;
  don't rewrite history to remove them.

## Later / parked ideas

- **"Hämta senaste pris" button via a tiny Cloudflare Worker** (parked
  2026-11-16): the browser can't read bauhaus.se (no CORS), so a Worker
  would fetch only the category pages for the project's sizes on demand.
  Works for Bauhaus only — Hornbach's bot challenge blocks servers too, and
  we don't get around it. For Hornbach, options are a "Visa på Hornbach"
  search link (user reads the price and enters it as "Eget pris") or asking
  Hornbach for a partner feed/API.

## Model conventions

- All lengths in **millimetres**, scene units are mm too.
- Part local geometry: length along X, thickness along Y, width along Z,
  origin at a corner. Rotation is quarter turns per axis (always
  axis-aligned). `rotatePart` keeps the bounding-box min corner fixed.
- Profile ids are `<category>-<t>x<w>` (boards) and `<category>-<t>`
  (sheets); stock lengths and sheet sizes in `catalog.ts` are typical
  values, not verified per supplier.
- Sheets are nested with a guillotine best-short-side-fit packer
  (`packSheets`); every sheet size on offer is tried and the cheapest
  result kept. Pieces rotate freely unless `part.grain` is set (plywood and
  OSB only, `hasGrain`): the stock sheet's grain is assumed to run along its
  long side, so 'length' pieces lie unrotated and 'width' pieces rotated.
  Grain shows as a stripe texture in 3D (UVs survive CSG) and as a striped
  pattern in the sheet diagram.
- Boards: `packCuts` tries each stock length as bin size with first-fit and
  a subset-sum "best fill", then gives each board its cheapest fitting
  length; keeps the cheapest total (without prices: least timber).
- Selection is `selection: string[]`; a tap in 3D selects the part's whole
  group (`tapPart`), the parts list selects single parts. One gizmo moves
  an invisible pivot at the selection's min corner; parts follow live and
  are committed with `moveSelection`. Groups (`project.groups`,
  `part.groupId`) with <2 parts are pruned automatically.
- Joints (`src/lib/joints.ts`): `part.notches` are boxes in part-local
  coords, rendered with three-bvh-csg. *Kapa mot* changes length (and
  position at the start end); *Urtag*/*Halvt i halvt* add notches and
  don't change cut length. Overlaps fully cleared by notches aren't
  reported. Parts with different notches are separate cut-list rows.
- Angled cuts (`src/lib/cuts.ts`): `part.ends` = [start, end] end cuts,
  plane 'face' (miter, across z) or 'edge' (bevel, across y); signed angle
  picks the long-point side; length is measured on the long side.
  `part.rip` = one half of a lengthwise angled rip (French cleat); both
  halves share `rip.id`, keep the original size/position, and count once
  in the cut list and shopping list (`stockPieces`). Overlaps inside
  cut-away regions (incl. points on the cut line) count as resolved, so a
  mitered corner or a cleat pair doesn't show as a collision.
- Measuring (`src/lib/measure.ts`, `ergonomics.ts`): taps pick a point +
  surface-normal axis (`pickPoint`); `measureValue` measures along the
  first surface's normal (floor taps measure up from the floor), or along
  the surface when both taps share a plane. `freeSpace` probes the middle
  half of each face so a table's corner legs don't hide the space under it.
  Guideline ranges (`GUIDES`) are general furniture practice from memory,
  labelled "riktvärden" in the UI — not sourced; don't present as rules.
  `project.measurements` persist; they're not in undo history.
- The phone bottom panel has a fixed height (42dvh) so the 3D view doesn't
  resize (and the model jump) as panel content changes.
- Position fields show the selection's bounding-box min corner, not the
  part's internal origin.
- Snapping (`src/lib/snap.ts`, toggles in `settings.snapTypes`):
  measuring taps get candidates on the tapped face of the part's bounding
  box (corners, edge midpoints, nearest edge point, face centre, part
  centre), filtered by **on-screen** distance (30 px touch / 14 px mouse)
  and ordered by priority; the alternatives are kept in `snapChoice` so the
  chip in the view cycles them. Two snapped points measure along their
  largest difference (c/c). Dragging: grid via TransformControls
  `translationSnap`, then `snapMove` aligns faces and centres with nearby
  parts on the dragged axes and returns guide lines. Snaps use bounding
  boxes, so notches and angled cuts are ignored.
- Printing: `window.print()` with a print-only `PrintReport`; the 3D
  snapshot needs `preserveDrawingBuffer` and is taken with overlays hidden
  (drei `Html` labels are DOM, not in the canvas).
- Deploy: GitHub Pages via Actions on push to `main`; `vite base: './'`.

## Commands

`npm run dev`, `npm test` (vitest, logic in `src/lib/`), `npm run build`
(also type-checks).
