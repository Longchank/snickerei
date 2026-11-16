# snickerei

En webblösning som skapar 3D-modeller och såglistor, samt har inbyggd prislista.
Byggd för hobbysnickare.

## Vad finns nu (v0.2)

Byggd för mobilen först — fungerar även på dator.

- **Fri 3D-modellering med låsta mått**
  - **Virke** (konstruktionsvirke, hyvlat, tryckimpregnerat, läkt): en 45x70
    är alltid 45x70, bara längden kan ändras.
  - **Skivor** (plywood, MDF, OSB): tjockleken är låst, längd och bredd är fria.
- Flytta med pilarna i 3D-vyn eller med −/+-knappar. Delar **fäster mot
  varandra** (kant mot kant, i liv) och mot ett rutnät på 1–100 mm.
- **Mått i 3D-vyn** för markerad del, eller totalmått när inget är markerat.
- Rotera i 90°-steg, duplicera, ångra/gör om, "visa hela modellen".
- **Såglista** och **inköpslista**: vilka längder/skivor som ska köpas, med
  snittbredd, kapschema för virke och skärschema för skivor.
- **Skriv ut / spara PDF**: projektbild, såglista, inköpslista och scheman.
- **Prislista**: egna priser (kr/lm för virke, kr/skiva för skivor).
  Exempelpriser (inte riktiga) visas tills prishämtning finns.
- Sparas automatiskt i webbläsaren; exportera/importera projektfil (JSON).
- Kan läggas till på hemskärmen och öppnas som en app.

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

- Prishämtning (scraping) från bygghandlare — kräver en liten backend
  (webbläsaren kan inte hämta andra sajter direkt p.g.a. CORS). Kolla varje
  sajts villkor och robots.txt först.
- Fiberriktning på skivor (låsa rotation i skärschemat).
- Mäta avstånd mellan två valfria punkter.
