# snickerei

En webblösning som skapar 3D-modeller och såglistor, samt har inbyggd prislista.
Byggd för hobbysnickare.

## Vad finns nu (v0.6)

Byggd för mobilen först — fungerar även på dator.

- **Fri 3D-modellering med låsta mått**
  - **Virke** (konstruktionsvirke, hyvlat, tryckimpregnerat, läkt): en 45x70
    är alltid 45x70, bara längden kan ändras.
  - **Skivor** (plywood, MDF, OSB): tjockleken är låst, längd och bredd är fria.
- Flytta med pilarna i 3D-vyn eller med −/+-knappar. Delar **fäster mot
  varandra** (kant mot kant, i liv) och mot ett rutnät på 1–100 mm.
- **Mått i 3D-vyn** för markerad del, eller totalmått när inget är markerat.
- Rotera i 90°-steg, duplicera, ångra/gör om, "visa hela modellen".
- **Markera flera** ("Flera" i 3D-vyn, eller Shift/Ctrl+klick) och flytta,
  rotera, duplicera eller ta bort dem tillsammans.
- **Grupper** (t.ex. "Ben", "Sits"): ett tryck markerar hela gruppen.
- **Fogar** när delar går in i varandra: *Kapa mot* (stumt, kortar
  kaplängden), *Urtag*, *Halvt i halvt* och *Gering* (hörn som möts i
  diagonalen). Urtagen syns i 3D och står med mått i såglistan och
  utskriften.
- **Sneda ändar**: gering (över sidan) eller fas (över kanten) i valfri
  vinkel i varje ände. Längden mäts på långsidan.
- **Fiberriktning** på plywood och OSB: valfri, längs eller tvärs delen.
  Låsta delar vänds inte i skärschemat (skivans fibrer antas gå längs
  långsidan) och visas randade i 3D och i schemat.
- **Fransk list**: klyv en del på längden i 45° (eller annan vinkel) till
  två listar. Räknas som en bräda i såglistan och inköpslistan.
- **Såglista** och **inköpslista**: vilka längder/skivor som ska köpas, med
  snittbredd, kapschema för virke och skärschema för skivor.
- **Skriv ut / spara PDF**: projektbild, såglista, inköpslista och scheman.
- **Priser från Bauhaus** (webbpriser): inköpslistan köper de längder och
  skivstorlekar som faktiskt säljs, väljer billigaste kombinationen och
  länkar till produkterna. Egna priser (kr/lm, kr/skiva) går före;
  exempelpriser (inte riktiga) används bara där inget annat pris finns.
- Sparas automatiskt i webbläsaren; exportera/importera projektfil (JSON).
- Kan läggas till på hemskärmen och öppnas som en app.

## Priser

`npm run prices` hämtar Bauhaus kategorisidor för virke och skivor (16 anrop
med 2 s paus, bara sidor som robots.txt tillåter) och sparar
`public/prices/bauhaus.json`. Publiceringen gör detta automatiskt, och
dessutom varje måndag. Misslyckas hämtningen används filen som ligger i repot.

Hornbach blockerar automatiska anrop (bot-skydd även på robots.txt), så
deras priser hämtas inte.

## Publicering

GitHub Actions bygger och publicerar till GitHub Pages vid varje push till
`main` (`.github/workflows/deploy.yml`). Engångsinställning: repots
**Settings → Pages → Source: GitHub Actions**.

## Kom igång

```bash
npm install
npm run dev      # utvecklingsserver
npm test         # enhetstester
npm run build    # produktionsbygge i dist/
```

## Teknik

React + TypeScript + Vite, Three.js via react-three-fiber/drei, Zustand för
state. Ingen backend än.

## Planerat

- Knapp "Hämta senaste pris" via en liten Cloudflare Worker (bara Bauhaus).
- "Visa på Hornbach"-länk för att själv slå upp och skriva in priset.
- Fler bygghandlare (Byggmax, Beijer, XL-Bygg, K-Rauta …) — kolla varje
  sajts villkor och robots.txt först.
- Mäta avstånd mellan två valfria punkter.
