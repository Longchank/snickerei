# snickerei

En webblösning som skapar 3D-modeller och såglistor, samt har inbyggd prislista.
Byggd för hobbysnickare.

## Vad finns nu (v0.1)

- **Fri 3D-modellering med låsta virkesdimensioner** — lägg till brädor ur
  katalogen (konstruktionsvirke, hyvlat, tryckimpregnerat, läkt). En 45x70 är
  alltid 45x70; bara längden kan ändras.
- Flytta med pilarna i 3D-vyn (fäster mot 1–100 mm), rotera i 90°-steg,
  duplicera, ångra/gör om.
- **Såglista** — alla delar grupperade per dimension och längd.
- **Inköpslista** — räknar ut vilka saluförda längder som behöver köpas,
  med snittbredd för sågklingan, kapschema och spill.
- **Prislista** — egna priser per löpmeter. Exempelpriser (inte riktiga) visas
  tills prishämtning från bygghandlare finns.
- Projektet sparas automatiskt i webbläsaren; exportera/importera som JSON.

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
- Skivmaterial (plywood, MDF, OSB) — fast tjocklek, fri bredd/längd.
- Fäst mot andra delars ytor och kanter, måttsättning i 3D-vyn.
- Utskrift/PDF av såg- och inköpslista.
