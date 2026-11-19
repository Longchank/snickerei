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
  a time, 2 s apart, ~16 requests per run. **Price fetching is switched
  off** (owner, 2026-11-19: "let's not fetch prices at all until I fix a
  Cloudflare account"): the deploy workflow no longer runs it (no weekly
  cron), and the app no longer loads `prices/*.json` (`loadSupplierPrices`
  kept, unused). Wanted next: the user **picks a store** and its prices are
  fetched then, via the Cloudflare Worker (see Later). Until then: own and
  example prices only. The scraper still runs locally. **The price file is not committed** (gitignored,
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

- **Pick a store → fetch its prices, via a tiny Cloudflare Worker**
  (owner 2026-11-19, waiting on the owner's Cloudflare account; replaces
  the weekly fetch, which is switched off). Earlier note (2026-11-16): the browser can't read bauhaus.se (no CORS), so a Worker
  would fetch only the category pages for the project's sizes on demand.
  Works for Bauhaus only — Hornbach's bot challenge blocks servers too, and
  we don't get around it. For Hornbach, options are a "Visa på Hornbach"
  search link (user reads the price and enters it as "Eget pris") or asking
  Hornbach for a partner feed/API.

- **Strength analysis — known gaps** (todo, owner 2026-11-18): screws,
  glue, notches and angled cuts are not taken into account; each span is
  treated as simply resting on its supports, which is on the safe side.
  Diagonal braces can't be modelled, since the model only has right
  angles — only a standing sheet counts as bracing against wobble.

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
- **Modes "Bygg | Redigera"** (owner 2026-11-18, `settings.mode`, switch in
  the toolbar). Bygg: a tap toggles the part's whole group in the
  selection (several at a time, no "Flera" toggle); a floating action bar
  offers Gruppera/Dela upp · Flytta · Duplicera · Ta bort; tap-to-place
  switches to Bygg. Redigera: a tap picks one part (even inside a group)
  and opens the Del panel. `pickPart` routes taps by mode. Switching to
  Bygg closes the details panel (it hid the action bar, so the switch
  looked broken); switching to Redigera with a selection opens it. **The
  Del tab exists only in Redigera** (owner 2026-11-18; desktop: the
  "Egenskaper" tab) — in Bygg the tab bar is Lägg till · Listor · Priser.
  Measuring still opens the panel's Del slot in either mode. With
  the phone panel open, the action/move/place bars sit at the top
  (`.sheet-open .place-top`) instead of behind the panel.
- **Moving** (`moveMode`, `src/lib/move.ts`): diegetic arrows in the 3D
  scene on the selection's six faces (`MoveArrows`, constant on-screen
  size via `useFrame`, big invisible tap zones) move one step
  (`settings.moveStep`, 1–100 mm or typed); tapping another board moves
  the selection flush against the tapped face at its start/centre/end
  (`moveNextTo`); tapping the floor sets it down there (`moveToFloor`).
  The free TransformControls gizmo is an "Avancerat" menu option
  (`settings.freeMove`, off by default), smaller, with the two-axis plane
  handles removed (`stripPlaneHandles`).
- **Editable gaps** (owner 2026-11-18): the green free-space numbers
  (`FreeSpaceLines`) are buttons; tapping one opens a number field
  (`GapInput`, Enter/blur commits, Esc cancels) and the selection slides
  along that gap's axis so the gap becomes the typed value (`moveToGap`,
  never past touching). One undo step.
- **Rotating** (`rotateMode`, owner 2026-11-18: "in steps so no freeform
  rotation"): 90° steps only (the model is axis-aligned). `RotateRings`
  draws one ring per axis around the selection (red X / green Y / blue Z,
  constant on-screen size) with two arrow handles each (±90°); `RotateBar`
  has the same as buttons (Vrid = Y, Tippa = X, Sida = Z). Turns use
  `rotatePartsInPlace` (about the selection's centre), except a selection
  resting on the floor stays on it, and one above is never turned through
  it. Move, rotate and place close the phone panel so the rings/arrows
  aren't hidden.
- Selection is `selection: string[]`; the parts list selects single parts. A tap that misses
  every part runs the same fuzzy ring pick as placing (`fuzzyPickRef`,
  36 px touch / 16 px mouse) and selects the nearest board; only a clear
  miss deselects (owner 2026-11-18: boards are thinner than a thumb). One gizmo moves
  an invisible pivot at the selection's min corner; parts follow live and
  are committed with `moveSelection`. Groups (`project.groups`,
  `part.groupId`) with <2 parts are pruned automatically.
- Joints (`src/lib/joints.ts`): `part.notches` are boxes in part-local
  coords, rendered with three-bvh-csg. *Kapa mot* changes length (and
  position at the start end); *Urtag*/*Halvt i halvt* add notches and
  don't change cut length. Overlaps fully cleared by notches aren't
  reported. Parts with different notches are separate cut-list rows.
- Angled cuts (`src/lib/cuts.ts`): `part.ends` = [start, end] end cuts,
  plane 'face' (miter, across z, UI "Gering") or 'edge' (miter sawn with the
  board on edge, across y, UI "Högkant" — not "Fas"); signed angle picks
  the long-point side; length is measured on the long side.
- **Corners match** (`src/lib/corner.ts`, owner 2026-11-17: "if 2 lumber
  have matching end cuts they should match up"): setting an end cut on an
  end that meets another board's end at a corner (`findCornerPartner`;
  not a T) changes both boards: Gering/Högkant → both reach the outer
  corner and get the diagonal miter (`cornerMiter`, angle from the
  widths, user angle ignored); Rak → butt joint, the edited board runs
  through and the partner ends against it (`cornerButt`). **Lengths never
  change** (owner 2026-11-18: "1 meter is still 1 meter after being
  cut"): a board that doesn't reach is slid along its length (`slideEnd`),
  so its far end moves instead. **"⇄ Byt stötfog"** (owner 2026-11-18,
  reworked after testing): **keeps the outer size and re-cuts** — the one
  exception to "lengths never change". `recutButt` puts the runner's end at
  the outer corner and stops the other at the runner's near side; both far
  ends stay put, so neighbouring corners never come apart. Scope
  (`switchButtJoints`): two selected boards sharing a square corner → that
  corner only (toggle); anything else → the selection's whole frame
  (`frameCorners`: square corners reachable board to board; miters and
  sheets skipped), where every corner gets the boards along one axis
  running through — the axis that mostly stops now (ties: standing
  boards), so the button reads "⇄ Låt de stående gå igenom (4 hörn)" and
  toggles back. Bygg action bar.
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
- **Phone layout = floating panels** (owner, 2026-11-17, modelled on their
  projector-mount viewer): the 3D canvas always fills the screen; the
  toolbar and bottom panel are see-through cards on top (blur, rounded),
  so opening/closing never resizes the view. "Visa hela modellen" fits the
  model into the visible gap between them (reads their screen rects). The
  axes widget sits top-left on touch screens.
- Placing by tapping (`src/lib/place.ts`, owner request 2026-11-17: "easy
  to add lumber to placed lumber, mostly at the ends or centre, to build a
  frame"): with parts in the model, a catalog button arms
  `placeProfile`; each tap places one board until "Klar". Side face → the
  new board stands out along the normal, snapped to the target's
  start/centre/end (outer 25 % / middle 25 %), flush with the target's
  lower side, filling up to the nearest part ahead. End face → turns 90°
  towards the centroid of the other parts and spans the parts in its way.
  Floor taps within a zoom-scaled margin of a part on the floor count as a
  tap on its top (`floorTapTarget`). Missed taps (floor or air) cast rays
  in rings up to 36 px (touch) around the tap (`fuzzyPickRef`); a hit there
  is a "missed" tap, for which standing on top comes first.
  `placementOptions` lists the alternatives (tapped direction, up, other
  sides, other rail directions); "⟳ Annan riktning" cycles them without an
  undo step, so "↶ Ångra" in the banner removes the board in one go. Move
  arrows are hidden while placing; the Del tab doesn't auto-open.
  Options that would go below the floor are dropped. **"⟳ Annan riktning"
  also works on a placed board** (owner 2026-11-18): Bygg action bar with
  one board selected; `contactOf` finds what it sits on (contact at its
  own end first, then largest area) and `reorientOptions` re-runs
  `placementOptions` from there. First tap = one undo step, further taps
  replace it (`placeChoice` reused while the board stays where the last
  tap put it). Notes read "Stående/Liggande/På högkant, vid änden · …".
- **Sheets are placed with two taps** (owner 2026-11-19): arming a sheet
  (even in an empty model) waits for a first corner (`sheetCorner`,
  marker in 3D), then the opposite one; `sheetBetween` fills the
  rectangle on the first tap's surface (floor, top of a frame, side of a
  post — thickness on the outside of that face), second corner projected
  onto it, longer side = length. Taps on boards snap to their corners and
  edges (the measuring snaps); otherwise rounded to `settings.snap`.
  Stays armed for the next sheet until Klar.
- **"▦ Ram under skivan"** (owner 2026-11-19: "create the sheet first,
  then specify the framing under it", `src/lib/frame.ts`): Bygg action bar
  when one lying sheet (plus any of its own frame boards) is selected.
  `frameUnder` builds two long rails along the sheet's long sides (full
  length), two end rails between them and N joists (tvärreglar) evenly
  spaced c/c between the end rails, flush with the sheet's edges, on edge
  (högkant) or flat; if the sheet is too low it's lifted so nothing goes
  through the floor. Settings live on the sheet (`part.frame`), boards
  carry `frameOf: sheetId` and are regenerated on every change
  (`applyFrame`, live in `FrameBar`; first change = one undo step, later
  ones replace it). Sheet + frame become one group ("Skiva med ram").
  Default: 45×70 on edge, joists for ≤600 mm spacing. Lying sheets only.
- **Lägg till menu** (owner 2026-11-18): every catalog category and the
  Delar list fold (`Fold`, `<details>`), closed by default; opened ones
  are remembered per device (localStorage `snickerei-open-folds`). On the
  phone the panel closes when a board has been added.
- **Del panel** (owner 2026-11-18): no name field (names still exist in
  data and lists, just not edited here); the header is one line,
  "45×95 × [length] mm" (sheets: "Plywood 12 · [L] × [W] mm"); no
  Yttermått for a single part (kept for several); no Kopiera/Ta bort
  buttons (they live in the Bygg action bar; Ctrl+D / Delete still work). **Ändar** are named by
  where they point (`src/lib/ends.ts`: Vänstra/Högra = x, Nedre/Övre = y,
  Bakre/Främre = z, world-based), with matching purple labels on the
  board's ends in the 3D view (`EndLabels`, Redigera, one board) and a
  one-line explanation of Rak/Gering/Högkant. **Analys tab** (◎, both
  modes): free space + riktvärden (`SpaceInfo`) moved out of Del.
- **Strength analysis** (`src/lib/strength.ts`, Analys tab, owner
  2026-11-18: "strength, bends etc."). Owner chose: sag + capacity,
  weight + tipping, wobble; loads from **presets** (`project.purpose`:
  Bokhylla/Förvaring/Bord/Bänk/Arbetsbänk → kg/m² on free top surfaces,
  a point load for people, long-term = creep). Material values per
  category (`MATERIALS`: C24/C18/C14 from EN 338, rough sheet values) and
  load presets are **typical figures from general knowledge, not
  sourced** — the UI calls it all "uppskattning". Method: bounding boxes;
  a horizontal part is held up by parts under it or beside it reaching
  lower (legs); loads flow top-down (own weight + preset on free tops,
  passed to supports, point loads to the nearest support); each free span
  is checked as simply supported (overhangs as cantilevers) with
  utilisation vs 0.6·fm and sag vs span/300 (overhang /150); status
  ok/warn/bad; "klarar X kg mitt på" says whether sag or strength sets
  it. Tipping: push at the top vs floor footprint (empty build). Wobble:
  ≥2 posts and height ≥300 with no standing sheet in a plane → warn (the
  model is axis-aligned, so no diagonal braces exist). "Visa i 3D" tints
  parts green/yellow/red (`analysisView`, grey = not checked). Not
  modelled: joints, screws, glue, notches, angled cuts, two-way plates.
  **Legs/posts** (`checkPost`): standing boards that carry load get
  crushing (A·fc·0.6, `fc` per category) and Euler buckling about the weak
  axis (E05 ≈ 0.67·E, /1.3, buckling length = height, hinged ends —
  safe side), combined with Rankine; listed under "Ben och stolpar".
  Standing parts on top of a shelf now pass their load down too. **Own
  load per part** (`part.loadKg`, "Egen last" field on each lying part in
  Analys; empty = follow the purpose): replaces the preset spread load
  and the person load on that part.
- **Editable size labels / stretching** (owner 2026-11-19,
  `src/lib/resize.ts`): the dark size labels in 3D are buttons
  (`Dim` + `LabelInput`, same field as the green gaps). One board selected
  → only its length is shown; one sheet → length and width (thickness
  locked); several parts, a group or nothing selected → outer
  width/height/depth. Typing a size: one part changes size keeping its
  lower end (`setSizeAlong`); several **stretch** (`stretchParts`,
  `resizeSelection`): parts that can't change size along that axis (a
  board across it, a sheet's thickness) only move — near end stays, far
  end moves the full difference, in between keep their relative place —
  while boards along the axis and sheets get longer/shorter, each end
  following a moving part it butts against. Profiles never change.
- **No X/Y/Z transform fields** (owner 2026-11-18, removed once gaps
  were editable in the 3D view): the Del panel shows no position. Moving and turning happen in the 3D view (Bygg: arrows,
  rings, editable green gaps, Avancerat free gizmo).
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
- **Rendering is on demand** (`frameloop="demand"`, 2026-11-17, phone
  performance): the scene only redraws on React prop changes and controls'
  change events. Anything that mutates three.js objects outside React must
  call `invalidate()`. Phones render at dpr ≤ 1.5 with a 1024 shadow map.
  Camera near/far 30/60000. The grid is two plain `gridHelper`s (10 cm
  cells + 1 m lines, faint, no depth write) at y ≈ −1, the shadow floor at
  y −6, to avoid z-fighting flicker (drei's shader `Grid` was dropped). OrbitControls tuned calmer on touch
  (rotateSpeed 0.55, dampingFactor 0.15).
- Printing: `window.print()` with a print-only `PrintReport`; the snapshot
  comes from `snapshotRef` (renders a frame and reads it immediately, so no
  `preserveDrawingBuffer`), taken with overlays hidden (drei `Html` labels
  are DOM, not in the canvas).
- **No page scrolling** (2026-11-17): html/body are `overflow: hidden;
  overscroll-behavior: none`, the 3D view is `touch-action: none
  !important` (a library sets `auto` inline on the canvas). Otherwise
  Chrome's pull-to-refresh claims downward drags and cancels the camera
  rotation. Panels keep `touch-action: pan-y`. Print CSS restores normal
  flow so the printout spans pages.
- Phone UI: grab handle on the bottom panel (tap/swipe), and a full-screen
  mode (⛶ in the view, "Visa menyer" to return; Esc on desktop). Every pick
  (`pickCount`) opens the Del tab, also re-picking the selected part.
- Deploy: GitHub Pages via Actions on push to `main`; `vite base: './'`.

## Commands

`npm run dev`, `npm test` (vitest, logic in `src/lib/`), `npm run build`
(also type-checks).
