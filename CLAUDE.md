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
  sizes used for the shopping list. **Own sheet sizes** (owner
  2026-11-19, while prices aren't fetched): Priser → each sheet material
  (Plywood/MDF/OSB) has "Skivstorlekar" — add/remove sizes, "Återställ"
  = standard (`catalog` stockSheets). Stored per category in
  `ownSheetSizes` (persisted per device) and they win over shop and
  catalog sizes in `stockOptions`; passed through `purchasePlan`,
  `sheetPlanWith`/`bestSeams` and the Del panel's size hint. Prices stay
  per profile (kr/skiva, any size). **Own board lengths** (owner
  2026-11-19): same for timber — "Längder i butiken" per category
  (`ownStockLengths`, typed in m or mm). Both travel as
  `OwnStock = { sheets, lengths }` into `stockOptions`/`purchasePlan`.
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

- **3D-editor basics, parked** (owner 2026-11-20: "we don't need them
  right now"): **standard views** (front/side/top buttons, orthographic
  camera) and **Upprepa** (copy the selection N times at a set c/c, e.g.
  joists or shelf rails). Also suggested, not yet asked for: exploded
  view.

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
- **Four steps of a build** (owner 2026-11-20, replaced "Bygg | Redigera";
  `settings.mode: Phase`, `src/lib/phases.ts`): **1 Bygg** (big picture:
  add, move, turn, mirror, groups, frames) · **2 Detaljer** (lengths, ends,
  notches, seams, strength — "will it hold?") · **3 Montering** (step by
  step, screws) · **4 Inköp** (cut list, shopping list, prices, final
  checks). Steps are views, not gates: the model is editable in all of
  them. A phase bar under the toolbar (second row, `PhaseBar`) switches;
  each step has its own colour (`PHASES`: blue / violet / teal / pink,
  white text ≥ 4.5:1) set as `--accent`/`--accent-strong`/`--accent-soft`
  on `.app`, so every accent follows it, plus a coloured band on the
  toolbar and the phone panel and the 3D selection colour. Panels per step
  (`PHASE_TABS` in App.tsx): Bygg = Lägg till · Delar; Detaljer = Del ·
  Analys; Montering = Steg (`StepList`) · Skruv (`ScrewEditor`) · Delar; Inköp =
  Kontroll · Listor (cut/shopping list, screws `buyOnly`) · Priser. Desktop: catalog
  left in every step, the step's other panels right. Taps (`pickPart`):
  Bygg toggles whole groups (action bar); Montering picks one group (its
  screws); Detaljer/Inköp pick one part. **Montering** (owner
  2026-11-22): no size labels or free-space numbers in 3D; screws always
  drawn (`screwView || mode === 'montering'` — `screwView` itself is the
  global choice, "Skruv i 3D" in the view tool menu, kept across steps,
  shown lit and disabled in Montering and not kept out in the folded
  menu there (`quiet`)); each screw is drawn as a line like "Ny fog"
  (grey through the first part, green into the part behind, amber if
  short, red past its far side; four `Line segments` in `ScrewDots`) with
  the size-coloured head. **Steg tab = `StepList`**: only the build
  steps (each group, then Montering "Sätt ihop A + B · lösa delar: …"),
  each with what it's built from ("2 × 45x95"); ↑ ↓ reorder =
  `setGroupOrder` (undoable, the groups' order, so Steg för steg and
  the screw lists follow); tapping a step shows only it, selects its
  parts and zooms in on it (`fitView` after the panel closes — the fit
  effect depends on `shownParts`, it used to frame the whole model),
  again = everything; **✎ per group** selects it and opens the **Delar
  tab, which in Montering is `GroupParts`** (owner 2026-11-22): the
  selection as a group — group name as an editable header
  (`renameGroup`), then its parts in build order, each with a name field
  (`updatePart`, Enter/blur saves, Esc cancels) and ↑ ↓
  (`reorderParts(ids)`: those parts in that order in the slots they
  already take in `project.parts`; undoable). One part selected: its
  name as the header, nothing else; several from different groups: "N
  delar" + the list; nothing: a hint. With Steg för steg on a group's
  step (`activeStep`), Delar shows that group whatever is selected. **Screws follow the step** (owner 2026-11-23): with `activeStep` set, 3D screws and the Skruv list show only that step's joints (`jointStep(j)`: the group's id when both parts are in it, else 'montering' — so the last step shows only joints between groups and with loose parts). The panel stays open on picks in
  Montering's Delar (the "one window" close is skipped there). Other
  steps keep `PartList`. `requestPanel(open, tab?)` can switch tab. No screw info or totals there (still in Skruv,
  Listor and the printout, which use `ScrewList`). Switching step: Bygg closes the phone panel, Detaljer
  opens Del if something's selected, Montering/Inköp open their lists.
  Saved `mode: 'redigera'` loads as 'detaljer' (`toPhase`). To add a step:
  an entry in `PHASES`, its tabs in `PHASE_TABS` (phone fits ~5). Phone
  overlays sit at `top: 118px` below the two-row toolbar.
  The Bygg action bar has Gruppera/Dela upp · Flytta · Vrid · Spegla ·
  Kopiera · Ta bort; tap-to-place switches to Bygg. **The Del panel
  exists only in Detaljer** (owner 2026-11-18; desktop "Egenskaper");
  measuring still opens the Del slot in any step. With the phone panel
  open, the action/move/place bars sit at the top
  (`.sheet-open .place-top`) instead of behind the panel.
- **One window at a time on the phone** (owner 2026-11-21: "select the
  group in the list … hide the list after I have selected it. This goes
  for all functions"): a pick from a list (`tab === 'delar'`) or any pick
  in Bygg closes the panel, so the Bygg action bar shows; in Detaljer a
  pick opens Del (the panel *is* its window). Opening the panel folds in
  the tool menu and finishes move / turn / mirror / frame (like Klar —
  changes are already made); placing stays armed (the panel is where the
  next board is picked). With the panel open the Bygg action bar is
  hidden (CSS `.sheet-open .place-top:has(.action-bar)`) and returns when
  it closes. Kontroll's "Visa i 3D" closes the list via
  `requestPanel(false)` (store `panelRequest`, applied by App).
- **Saving screen space** (owner 2026-11-21: "shorten names, symbology,
  collapsible menus", going menu by menu). Round 1: phone toolbar without
  the logo; step buttons on one line (number + name); bottom tabs icon +
  name on one line, thinner grab handle; Bygg action bar = one row of six
  icon buttons with a short label under each (`button.act`: Gruppera/Dela
  · Flytta · Vrid · Spegla · Kopiera · Ta bort; icons in `Icons.tsx`),
  "▣ 45×95 (N)" select-similar chips in its title row, no "tap more parts"
  hint; long help texts fold behind `<Info>` (ⓘ + short label, `Info.tsx`)
  — catalog, screw advice, analysis load/disclaimer, Kontroll; full-width
  3D toggles became small chips (`chip view-toggle`: "● Skruv i 3D",
  "🎨 Färg i 3D"); no duplicate "Analys" heading. Round 2, **Del panel**:
  header "45×95 × [L] mm  ▣ Grupp  ✕" (the group chip selects the group;
  the "cross-section is locked" line is gone); sheets show "Butiken:
  2440×1220 mm"; "Fiber" one row. Sections are `Fold`s (`components/
  Fold.tsx`, extracted from Catalog; `status` text on the header,
  `defaultOpen`, open/closed remembered per device): **Ändar** (open,
  status "Gering 45° · Rak"; one row per end: tag · Rak/Gering/Högkant ·
  angle + ⇅; "↔ hörn mot X" line; explanations behind ⓘ), **Fogar**
  (open, status "⚠ N krockar" / "N urtag"), **Klyvning** (closed). Panel
  content 1014 → 702 px for a board with a miter and two collisions.
  Round 3, **frame bar**: title row "▦ Ram under skivan · 🗑 · Klar"
  (remove + done moved up); frame profile is a `<select>` next to
  Högkant/Flatt (was 13 chips); joists stepper row; **Skarvar i skivan**
  and **Ben** are `Fold`s (closed by default) with status "Hel · köp 1" /
  "⚠ ryms inte" and "Innanför · 45×95 · 900 mm"; outside legs:
  "Långsidor/Kortsidor" + "Skiva över" (was "Förläng skivan över benen")
  on one row; leg profile select + Höjd on one row. Bar content 674 px
  (scrolling) → 378 px with Ben open. Round 4, **Flytta / Vrid / Spegla
  bars**: shared title row `BarHead` (icon + name · ↶ · Klar; the old
  explanation line is the row's tooltip), then one row of controls (move
  steps; Vrid/Tippa/Sida; Spegla: "↔ Sidled / ⤢ Djup / ↕ Höjd" with axis
  colour dots + "⧉ Spegelkopia / ⇋ Vänd på plats"). Heights 136/134/189
  → 102/106/147 px. Round 5, **Listor + Priser**: Listor starts with a
  summary row "≈ 910 kr · [exempelpris] · 🖨 PDF", then `Fold`s
  **Inköpslista** (open; status "3 st · 910 kr"; "Sågblad" kerf field at
  its end), **Såglista** (closed; "N bitar"), **Skruv** (closed; "N st");
  the duplicate example-price box is gone. Priser: explanation behind ⓘ
  "Hur räknas priset?", one short line when no shop prices are fetched,
  "Exempelpriser där pris saknas", and each material is a `Fold` (closed;
  status "i projektet · N egna priser"), materials used in the project
  first; "(standard — ändra efter din butik)" → "(standard)". Round 6,
  **Kontroll + Steg & skruv**: a Kontroll item is one row (! + title, then
  "◎" = show in 3D and "→ N" = fix in step N in that step's colour); the
  explanation shows when the row is tapped or its "!" was tapped in 3D
  (`open` state follows `checkFocus`). Steg & skruv: "Totalt att köpa" is
  a closed `Fold` ("20 st · 2 storlekar"; plain heading in the printout),
  so the build steps come first.
- **Kontroll before buying** (owner 2026-11-21, Inköp → Kontroll,
  `src/lib/checks.ts` `runChecks`, `components/Checklist.tsx`): gathers
  what the app already detects — collisions (each pair once), parts
  floating in the air, beams/posts warn/bad from the strength analysis,
  tipping (only builds ≥ 400 mm tall — a lone board "tips" otherwise),
  wobble, screws blocked or shorter than the rule of thumb, boards longer
  than the longest stock length, sheet pieces larger than the store sheet,
  missing prices and example prices. Each `Issue` has severity (bad first),
  title, detail, parts, a 3D point `at` (or null) and the step it's fixed
  in (`fix`). Items (compact rows since round 6): "◎" (selects the parts
  and closes the list) and "→ N" in that step's colour (switches step,
  selects). In Inköp the 3D view
  shows a round "!" per issue (`CheckMarkers`, red = bad, amber = warn,
  drei `Html`); a tap sets `checkFocus` (store, not persisted), which opens
  the Kontroll tab and scrolls to and highlights that item.
- **Mått på/av in the view** (owner 2026-11-25, `DimsToggle` in
  Viewport.tsx): a button between ⛶ and the tool menu (Lucide
  RulerDimensionLine, lit when on) toggles `settings.showDimensions` —
  the same persisted setting as the menu's "Visa mått" — so size labels
  and the green free-space numbers hide. Disabled in Montering (never
  drawn there).
- **View tool menu** (owner 2026-11-21, `ViewTools` in Viewport.tsx,
  icons in `components/Icons.tsx`): the right edge of the view has ⤢ (fit)
  and ⛶ (full screen), then a tool button that folds out the global 3D
  tools as square line-icon buttons (Lucide-style SVGs, same look as the
  two glyphs) with a dark label pill to the left: Mät · Steg för steg ·
  Röntgen · Dölj · Visa bara · Lås (the last three act on the selection,
  disabled without one; they moved here from the Bygg action bar) and,
  when relevant, "Visa N dolda" / "Lås upp N" with a count badge. Folded
  in, tools that are on and the show/unlock buttons stay visible. Picking
  a tool folds the menu in (owner report 2026-11-21: the open menu's label
  pills covered the step bar's › button after choosing "Steg för steg").
  `toolsOpen` (store, not persisted): opening it closes the phone panel
  and opening the panel folds it in (the view is its own stacking context,
  so the menu can't sit above the panel); while open it's above the
  action/move bars (`:has(.tools-toggle.open)`).
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
  `part.groupId`) with <2 parts are pruned automatically. **Collisions
  show for any selection** (owner 2026-11-20: groups had no indication):
  `selectionOverlaps` = every collision a selected part is in, with parts
  outside the selection and between selected parts, each pair once → red
  boxes in 3D, plus "⚠ Krockar på N ställen (rött i 3D)" in the Bygg
  action bar.
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
  `project.measurements` persist; they're not in undo history. **Mät panel
  simplified** (owner 2026-11-21: "a lot of information"): header "📏 Mät ·
  Rensa · Klar"; one row per measurement ("1 · 765 mm · Höjd från golvet ·
  ✕") with only the best guideline under it ("✓ Barstol"); tapping a row
  shows what the ends snapped to, all guidelines and the seats line. The
  how-to paragraph and the "riktvärden" note are behind ⓘ "Hur mäts det?";
  the in-view hint says what to tap next. Kind labels: "Höjd från
  golvet", "Fritt mellan, lodrätt", "Avstånd, vågrätt"; a plain face tap
  reads "ytan" (was "på ytan"). The **Mät** tool button is lit (orange) and stays
  in the folded tool menu whenever measurements are shown in the model,
  not only while measuring, with a count badge ("Mät · 2 mått"); tapping
  it opens the panel (Rensa removes them and the button goes back).
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
  Copying (`duplicateSelection`) remaps `frameOf` to the copied sheet, so
  a copy's frame stays editable on its own; a frame board copied without
  its sheet loses `frameOf` and becomes a plain board.
  Default: 45×70 on edge, joists for ≤600 mm spacing. Lying sheets only.
  **Legs** (owner 2026-11-19, `frame.legs`: profile, placement, height of
  the sheet's top): four corner legs to the floor, wide face along the
  long way. Placements: *Innanför* (inner corners, up to the sheet),
  *Utanför* (outside the long rails, flush with the ends), *Under* (under
  the frame), *I ramen* (legs take the corners up to the sheet; long and
  end rails are shortened to fit between them — if the legs are narrower
  than the rails, the end rails stay between the long rails). The sheet
  moves so its top is at the height (never lower than sheet + frame +
  50 mm); turning legs on for a sheet with its top under 400 mm defaults
  to 900. Reopening the bar takes the height from where the sheet is now.
  `frameUnder` returns parts already at their final height — only the
  sheet is moved by `lift` (a double lift was a bug, fixed 2026-11-19).
  **"Förläng skivan över benen"** (now labelled "Skiva över"; owner 2026-11-19, checkbox with
  *Utanför*, `legs.cover`): the sheet is widened by the leg thickness on
  both long sides (`sheetForFrame`, `coverExtent`); the frame stays under
  the original footprint, so the legs end up under the sheet's edge.
  Unticking, another placement, or "Ta bort ramen" narrows it back. The
  frame's long way is stored once (`frame.axis`) so widening can't flip it.
  **Utanför: på långsidorna / på kortsidorna** (owner 2026-11-19,
  `legs.side`, default 'long'): 'short' puts the legs outside the end
  rails, flush with the long sides, turned so the wide face runs across.
  `coverExtents(f)` = [along the long way, across]; covering grows the
  sheet over the ends instead, and switching side moves the extension
  (`sheetForFrame` handles both axes). Joist positions and seams account
  for an end cover (`joistCentre`, `joistSpacing`).
  **Skarvar i skivan** (owner 2026-11-19: "split the sheet together with
  the joists" to buy fewer store sheets): `frame.seams` = joist numbers
  the sheet is split over; the seam is at that joist's centre, rounded to
  whole mm (`seamOffsets`). The sheet stays ONE part in the model;
  `stockPieces` → `splitSheet` turns it into its pieces for the cut list
  and shopping list (ids `<id>#n`, "(del n)"). Seams on joists that no
  longer exist are ignored. **✦ Smartast** (`bestSeams`, `seams.ts`)
  tries every seam combination (≤10 joists; else up to 3 seams) together
  with the project's other sheets of that material and keeps, in order:
  fewest pieces too large for a store sheet, lowest cost (no prices:
  least sheet area), fewest seams, most even pieces. UI: "Skarvar i
  skivan" in FrameBar (Hel / ✦ Smartast / one chip per joist) with a line
  "2 bitar: … · köp 1 skiva 2440×1220"; dashed lines in 3D (`SeamLines`).
  Strength analysis ignores seams (they sit on joists).
- **Screws** (owner 2026-11-20, `src/lib/screws.ts`, Listor → "Skruv",
  also in the printout): every pair of parts touching face to face is a
  joint (`screwJoints`; edges-only, collisions, apart and two boards end
  to end are skipped, cleat halves too). Screw goes *through* the part
  that's thinner along the screw (never along a board's length) *into*
  the other; into its end grain if the screw runs along that board.
  `chooseScrew`: **length ≈ 2 × t, at least 30 mm** (owner 2026-11-22,
  from Svenskt Trä's skruv- och spikguide on byggbeskrivningar.se:
  "dubbla längden av det man ska skruva fast"; its table: 12 → 28,
  19 → 40, 34 → 70, 45 → 80 — was bite 1.5 × t, a size or two too
  long), i.e. `wantBite` ≈ t (max 90); end grain 2 × t, 40–120 (our own
  assumption, not from the guide). Never through the far side (else the
  longest that fits); "kortare än tumregeln … vinkeljärn" only when the
  bite is < 3/4 of the wanted one (`SHORT_FRACTION`, so 45 into 45 with
  80 mm is fine). 4.5 mm sizes 40–80. **Pre-drilling is shown as advice**
  ("Råd: förborra …", "Förborra (råd)"). A "Vill du veta mer om skruvar?"
  link to the guide (`MoreAboutScrews`, ScrewList.tsx) sits under Steg,
  Skruv and Listor's screws. The guide's host is allowed in the
  Snickerei cloud environment. Diameter by t (4.0 ≤18,
  4.5 ≤25, 5.0 ≤40, then 5.0/6.0, 8.0 konstruktionsskruv >160 mm); common
  sizes in `SIZES`; sheets → skivskruv; pressure-treated → rostfri A4/C4.
  Count: 2 up to 100 mm contact, +1 per ~50 mm; sheets and long overlaps
  c/c 300 (sheets were c/c 200 until owner 2026-11-22: "too many on the
  plywood"). **Layout** (owner 2026-11-22): in short rows (≤ 250 mm) on a
  contact ≥ 30 mm wide the screws zigzag a quarter in from each side, so
  two screws sit diagonally ("you can screw in groups as long as you know
  which diagonal is where"). **Hand-set count** per joint:
  `project.screwCounts` ("through|into" part ids → 1–20, `jointKey`),
  `setScrewCount` (undoable — screwCounts is part of the undo snapshot;
  null = back to the suggestion). **Since 2026-11-22 this is
  `project.screwEdits`** (`ScrewEdit`: count, d+length, off, manual;
  saved `screwCounts` migrate in `normalizeProject`), edited with
  `setScrewEdit(key, patch | null)` (undoable; undefined/false fields drop
  back to the suggestion). **Montering → Skruv** (`ScrewEditor.tsx`, owner:
  "a menu item for screws which only holds the editing … crud style"):
  read = joints by build step (`Fold`s), only the selection's when
  something is selected ("Visa alla"); update = size `<select>`
  (`sizeOptions`, "✦" = suggestion) and − N + per joint; delete = 🗑
  switches a joint off (`off`: count 0, no dots, not in totals or
  Kontroll, hidden in Steg; "↺ Skruva igen") or removes a hand-added one;
  ↺ resets a changed joint; create = **"+ Ny fog" = joint mode** (owner 2026-11-22,
  replaced the Genom/In i form): store `jointMode` + `jointDraft`
  (not persisted; closes the phone panel, ends on panel open or leaving
  Montering; screw dots aren't tappable meanwhile). A tap on a face =
  the part screwed *through*; `planJoint` (screws.ts) finds the part
  right behind (probe 1 mm past the far side), guesses Början/Mitten/
  Änden from the tap (outer thirds of the shared face), clusters `count`
  screws there (40 mm from the edge, ≤ 60 mm apart, zigzag at ¼/¾,
  `flip` = other diagonal) and works out bite = length − t vs the rule
  of thumb, poke = longer than the part behind. `JointBar`: "Skiva →
  Regel · 4,0×50 · biter 32 mm" (green/amber "bör vara"/red "sticker ut
  N mm"), − N +, ⟋/⟍, size select, "✓ Lägg till N
  skruv" (stays armed for the next face). `JointPreview` in 3D: a head
  per screw and a line grey through the first part, green (amber if
  short) into the part behind, red beyond it (no depth test). Confirm =
  `setScrewEdit(key, {points: offsets, manual if new})`, appended to an
  existing joint's points (and switches an off joint back on). Old
  `manual` joints without points still use `manualContact`.
  **Tapping a screw selects its joint** (owner 2026-11-22, replaced the
  single-screw ScrewBar): `screwFocus {key}` (store, not persisted;
  cleared by opening the panel or switching step, closes the phone
  panel), all its screws get the white ring, and `JointEditBar` opens
  (BarHead "🔩 Fog" · ↶ · ✕): "Skiva → Regel · 4,0×40 · biter 22 mm"
  (green / amber short / red "sticker ut"), − N + (`countJointEdit`:
  spread screws re-spread; hand-placed ones keep their spots, + adds one
  30 mm on, − drops the last), ⟋/⟍ (`flipJointEdit`: spread → `ScrewEdit
  .flip` flips the zigzag; placed → mirrored across the contact), size
  select, "↺ Förslag", "🗑 Ta bort skruvarna" (off) / "Ta bort fogen"
  (manual). **Montering → Skruv: tapping a joint's name** selects both
  parts, opens the same bar and zooms to the joint (`fitView(box)` —
  fitView now takes an optional box, the joint's contact ± 60 mm).
  `Joint` carries `t`, `depth`, `placed`, `flip`. Hand-placed spots are
  `ScrewEdit.points`, offsets from the through part's box min
  (`pointOffsets`), clamped onto the contact. **Ny fog**: no Början/
  Mitten/Änden buttons any more — the screws centre on the tap (kept
  40 mm in from the face's ends, `anchor: 'tap'`); its bar and the joint
  bar close with ✕ instead of Klar. **✕ on every bar** (owner 2026-11-23): `BarHead` (Flytta/Vrid/Spegla/Fog/Ny fog), the frame bar, the place banner and the Mät panel all close with a 40 px `button.bar-close` ✕ — no "Klar" buttons left. **Long names** (owner report 2026-11-24): on the phone `.place-banner` is `max-width: 100%` (was `none`, so a long part name pushed Ny fog off screen); bar rows have `min-width: 0`, the BarHead title ends in …, and the joint line is `JointNames` (each name cut with … on its own, "A… → B…") with the screw info wrapping to its own line. Checked every bar and panel with 60-character names on a Pixel 7.  `screwJoints(parts,
  edits)` everywhere (list, 3D dots, totals, Kontroll). `normalizeProject`
  also keeps `purpose` (it used to be dropped on reload). **Pre-drill** (`pilotBit`, ≈ 0.6 × d softwood,
  0.75 × d MDF, rounded to 0.5 mm) near an end (< 10 × d), into/through
  MDF, or 8 mm screws. Totals per size (`screwTotals`) with ~10 % spare,
  rounded to tens, plus the bits; "Fog för fog" list. Apart from the
  length rule, the rules of thumb are from general knowledge, not sourced
  — the UI says "förslag efter tumregler". **Screws in 3D** (owner 2026-11-20): each joint has
  `points` (screw heads on the through part's outer face, spread over the
  contact: evenly in short rows, 40 mm in from the ends in long ones) and
  `dir`. "● Visa skruv i 3D" in Listor → Skruv toggles `screwView`
  (not persisted); `ScrewDots` draws a dot per screw, constant on-screen
  size, coloured per screw size (`SCREW_COLORS` in totals order) — the
  same colour dot is the legend in the table and the joint list.
  **Per group** (owner 2026-11-20: "you build the frame first, then add
  the legs and other exterior posts"): `screwSections` orders the joints
  as build steps — each group on its own, then "Montering: A + B" for
  joints between groups (ungrouped parts count as "lösa delar"), then
  "Lösa delar". Listor → Skruv shows "Totalt att köpa" then "Steg för
  steg" (a fold-out per section with its own table and joints). In 3D,
  with a selection, only screws touching the selection are drawn
  (colours still from the overall totals). **Blocked access**
  (`blockedBy`): if another part covers the face the screws go in from
  (e.g. up through a rail that lies on a sill), the joint says
  "Åtkomst blockerad … snedskruva, skruva före X sätts dit, eller
  vinkeljärn". The check follows the build order (owner 2026-11-22:
  "each group should be screwed first, then the total"): inside a group
  only that group's parts can block; joining groups, every grouped part;
  a joint with a loose (ungrouped) part, everything — screws covered later
  by another group are fine.
- **Joints are opt-in** (owner 2026-11-23: "start with no joints, then
  create them with Ny fog; a button fills in the recommended screws"):
  `screwJoints(parts, edits)` returns only joints with an edit (`ScrewEdit
  .on` = taken in, or any change / `manual`); `{ all: true }` = every
  suggestion (old behaviour, used by tests and `suggestedJoints`).
  Skruv tab: "✦ Fyll i rekommenderade (N fogar [för det markerade])" =
  store `fillScrews(ids?)` (one undo step, `{on: true}` per suggestion);
  empty hint otherwise. 🗑 now removes the joint (`setScrewEdit(key,
  null)`), "↺ Förslag" = `RESET` patch (keeps `on`). New projects carry
  `project.screwsByHand: true`; `normalizeProject` migrates older saves
  once (every suggested joint not switched off gets `on`, manual ones
  kept). **Never into or through a sheet's edge** (owner 2026-11-23:
  "too brittle"): `isSheetEdge(p, axis)` = sheet whose thickness axis
  (`worldAxisOf(rotation, 1)`) isn't the screw axis; such pairs are no
  suggestion, and Ny fog's `plan.sheetEdge` shows a red "Skivans kant är
  för spröd" with no Lägg till.
  **Planned as a whole** (owner 2026-11-24: "not every pair of touching
  pieces but the best places so everything holds — screws often ended up
  in each other at assembly with several groups"): `fillScrews` uses
  `planScrews(parts, edits, groupOrder, only?)` — suggestions in build
  order (each group's own joints in group order, then Montering; side
  grain before end grain), joints already in the build are obstacles; a
  screw whose line (`screwLines`, head → tip) comes within (d1+d2)/2 + 6
  mm of another (`segmentDistance`, `linesClash`) moves to the nearest
  free spot on its contact (10 mm steps, 15 mm from its edges) or is left
  out; an end-grain joint is skipped only when a **sheet** is screwed
  into end grain while it's held on side grain and the part behind has
  other joints (a top screwed into the legs' ends) — board-to-board end
  grain (a rail into a joist's end) always stays: it holds the frame
  (owner 2026-11-25: the sheet screws had made every frame joint look
  "not needed", so only the sheet got screws). **Order: board joints
  first (build order, from the outside in), sheet joints last**, so the
  sheet's screws move around the frame's, not the other way round. Moved/thinned joints store `points`. The button's
  count is the planned joints. A test builds the table (legs inside /
  merged / outside / under): no clashes, every part held, no top-into-
  leg screws. `screwClashes(joints)` also feeds a Kontroll warning
  "Skruvar krockar" (fix in Montering), and Ny fog warns "⚠ Krockar med
  skruvarna i …" before adding.
  **From the outside in** (owner 2026-11-24: "screws should come from
  the outside in at assembly, it's easier to screw"): a new joint's
  through part is the one whose free side lies on the outside of its
  group's box (joints inside a group) or of the whole build (assembly
  joints); if both or neither are outside, the thinner one (as before).
  **A sheet against a board is always screwed through the sheet into the
  board** (owner 2026-11-25: "better to screw into the frame than into
  the sheets") — this comes before the outside rule.
  A joint already in the build keeps its direction: the edit's key
  ("through|into") decides, checked in both orders, so older saves are
  unchanged. **"⇅ Skruva genom X i stället"** in the joint editor
  (`reverseJoint(key)` → `reverseEdits`: the edit moves to the reversed
  key, hand-placed points dropped; undoable; `screwFocus` follows the
  new key); disabled when the part behind is end grain
  (`Joint.canReverse = !endGrain`).
- **Steg för steg** (owner 2026-11-20: "I build groups first, then the
  whole; the step by step should only show the selected step",
  `src/lib/steps.ts`): each group with parts is a step (group order),
  then "Montering" (everything). "Steg för steg" in the view tool menu opens `StepBar`
  ("‹ Steg 2/3 · Ben › ✕", `activeStep`, not persisted); the 3D view
  draws only the step's parts (`isShown`), fit/total dims follow, and
  Listor → Skruv shows only that step's sections (`ScrewSection.step`:
  group id, or 'montering' for joints between groups/loose parts), with
  step chips "Alla · 1. Ram · 2. Ben · 3. Montering". **Hide**
  (`part.hidden`, undoable): view tool menu "Dölj" / "Visa bara" (isolate);
  "Visa N dolda" there shows all again.
  Hidden parts still count in lists, screws and analysis. Other
  recommended basics are parked under "Later / parked ideas".
- **Lås, Röntgen, Markera likadana** (owner 2026-11-20). **Lås**
  (`part.locked`, undoable; view tool menu "Lås"): a locked part can't
  be selected anywhere — `select`/`tapPart`/`pickPart`/`groupMembers` drop
  it and `selected()` ignores it, so nothing moves, changes or deletes it.
  A tap on it in 3D passes through to what's behind (no
  `stopPropagation`); the fuzzy miss-pick ignores it. It's still a target
  for placing, measuring and "move next to". Grey edges in 3D; the Delar
  list shows it disabled with a 🔒 button to unlock just it; "Lås upp N"
  in the view tool menu unlocks all. Regenerated frame boards lose the
  lock. **Röntgen** (`xray`, not persisted, view tool menu):
  everything not selected is see-through (opacity 0.18, no depth write;
  the material is remounted via its key, as three.js won't switch
  transparency live). **Markera likadana** (`src/lib/select.ts`,
  `similarChoices`): when the selection is one profile, the action bar
  offers "▣ Alla 45×95 × 800 (N)" (same size) and "▣ Alla 45×95 (N)",
  among parts that are shown (step, hidden) and not locked; a choice that
  adds nothing isn't offered.
- **Spegla** (owner 2026-11-20, `src/lib/mirror.ts`): Bygg action bar
  "⇋ Spegla" → `MirrorBar` (`mirrorMode`, not persisted): direction
  Sidled / Djup / Höjd (was Vänster–höger / Fram–bak / Upp–ner), then "⧉ Spegelkopia" or "⇋ Vänd på
  plats". A part keeps its rotation and moves to its mirror place
  (`mirrorPart`); what isn't symmetric follows: along the length the
  `ends` swap, across a 'face' (width) or 'edge' (thickness) cut the angle
  flips sign, notches flip in local coords, a rip flips its angle (and
  half, across the width). The copy goes across the middle of the whole
  build, or right next to the selection if it spans the middle
  (`copyPlane`); ids, groups ("(spegel)"), `frameOf` and `rip.id` are
  remapped like `duplicateSelection`. Flip in place = across the
  selection's own centre.
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
  board's ends in the 3D view (`EndLabels`, Detaljer, one board) and a
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
  lower (legs), or by a board running across it that its end butts into
  (`buttsInto`: a joist or end rail screwed into a rail, even at the same
  height — owner report 2026-11-21 of joists "floating"; ties in the
  top-down order put the hanging part first so its load reaches the rail);
  loads flow top-down (own weight + preset on free tops,
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
  Anchoring spreads: a part butting against an anchored part follows it
  (a leg tucked inside a corner behind an end rail stays in that corner;
  owner report 2026-11-20 of legs leaving their corners). **Framed sheets
  are never stretched board by board**: after the stretch/resize, any
  sheet with `frame` gets its frame rebuilt from its settings
  (`rebuildFrame` → `buildFrame`, legs to the floor from the sheet's new
  height); joist count is kept, spacing follows.
- **Skala** (owner 2026-11-24, Detaljer, `src/lib/scale.ts`): "⇔ Skala"
  in the Del panel (under the header) → `scaleMode` (store, not
  persisted; closes the phone panel, ends on panel open / leaving
  Detaljer / ✕) + `ScaleBar`. A tap on the selected part picks the end
  that grows (`scaleFace`: the tapped face if it can move, else the
  nearest movable end — `nearestFace`, since end faces are a few px on a
  phone); then a tap elsewhere is where it ends (`scaleTarget`: a face
  parallel to the end → its plane; another part's side → its near face,
  so the board reaches it; the floor → y 0 for a downward end, else the
  tap) and `scaleTo` moves that face, the other end stays (≥ 10 mm). Floor
  taps use the fuzzy ring pick like Flytta. "− N / + N" with the move
  step (`scaleStep` → `scaleBy`). Each change is one undo step (no
  re-pick, or the Del panel would reopen and end the mode). Only sizes
  that may change (`freeSizeAlong`: board length, sheet length/width).
  `ScaleFaces` tints the movable faces (violet) and the chosen one
  (orange); dims and end labels are hidden meanwhile. Framed sheets are
  not rebuilt by it. **Klyvning** (French cleat rip) isn't shown for
  sheets.
- **Picking from a list moves the camera** (owner 2026-11-24, "for all
  views"): `zoomToParts(ids)` (Viewport.tsx) fires the fit event with
  `{ ids }` 350 ms later (after the phone panel settles) and the fit
  frames just those parts. Used by: Delar (Bygg; a part or a group
  head), Montering's Delar (the row number zooms to the part without
  changing the selection, so the list stays), Kontroll's ◎ and → N,
  Analys rows (beams, floating parts, posts), the Del panel's group
  chip. Steg (a step) and Skruv (a joint's name) already zoomed.
- **Icons** (owner 2026-11-24, after a reference picture of thin line
  icons): common functions use **Lucide** (`lucide-react`, pinned 1.71.0,
  ISC — credited in README), drawn through `Ic` / the `L` map in
  `components/Icons.tsx` (stroke 1.75, sized 1.15em to the text unless a
  size is given; tool buttons 22 px via the old `Icon*` names, which now
  wrap Lucide). Not Font Awesome: its free set is solid only. **The
  woodworking-specific icons the owner draws themself** (2026-11-24) —
  until then they keep their glyphs: Delar ▤, Del ✎, Analys ◎, Skruv 🔩
  (tab) and the screw line icon (`IconScrew`, Skruv i 3D, Fog/Ny fog
  bars), Skala ⇔, Byt stötfog ⇄, Ram under skivan ▦, Spegelkopia ⧉,
  Fyll i rekommenderade ✦, Skruva genom … ⇅, Byt diagonal ⟋/⟍, hörn mot ↔,
  ● Skruv i 3D chip, and the text-only Rak/Gering/Högkant, Kapa mot/
  Urtag/Halvt i halvt, Fransk list, Fiber, ben placements. **Ändar
  done** (owner's own drawing, redrawn as SVG 2026-11-24): `CutIcon`
  (Icons.tsx, 32 px, icon only with title/aria-label) on the Rak / Gering
  / Högkant buttons — a 45×45 board with its sawn end towards the viewer,
  outline 0.8, the cut face tinted (`currentColor` 12 %) with end-grain
  rings 0.225, no grain lines (owner's choices). **Step
  buttons stay numbers only** ("1 Bygg" …). A proposal page with drafts
  of all icons was shown (not used). Lucide picks: Undo2/Redo2, Menu,
  FilePlus, Printer, FileOutput/Input, ScanSearch (fit), Expand
  (fullscreen), SlidersHorizontal, X, Ruler, Footprints (Steg för steg),
  ScanEye (Röntgen), Eye/EyeOff, Focus (Visa bara), Lock/LockOpen,
  Group/Ungroup, Move, RotateCw, FlipVertical2 (Spegla), FlipHorizontal
  (Vänd på plats), Copy, Trash2, SquareDashedMousePointer (Markera
  likadana), Repeat2 (Annan riktning), MoveHorizontal/Diagonal/Vertical
  (mirror axes), WandSparkles (Smartast), ArrowUpDown, Palette, Pencil,
  ArrowUp/Down, History (↺), Minus/Plus, Check, ChevronLeft/Right,
  Crosshair (Visa i 3D), Info, ListOrdered (Steg tab), ClipboardCheck,
  ClipboardList, Tag, Plus (Lägg till).
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
  rotation. Panels keep `touch-action: pan-y`. The floating bars inside
  the view (`.viewport .place-banner`: frame, move, place) are exempted
  with `pan-y` too — otherwise the tall frame bar couldn't be scrolled by
  finger (owner report 2026-11-19). Print CSS restores normal
  flow so the printout spans pages.
- Phone UI: grab handle on the bottom panel (tap/swipe), and a full-screen
  mode (⛶ in the view, "Visa menyer" to return; Esc on desktop). Every pick
  (`pickCount`) opens the Del tab, also re-picking the selected part.
- Deploy: GitHub Pages via Actions on push to `main`; `vite base: './'`.

## Commands

`npm run dev`, `npm test` (vitest, logic in `src/lib/`), `npm run build`
(also type-checks).
