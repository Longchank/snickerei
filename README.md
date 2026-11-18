# snickerei

En webblösning som skapar 3D-modeller och såglistor, samt har inbyggd prislista.
Byggd för hobbysnickare.

## Vad finns nu (v0.10)

Byggd för mobilen först — fungerar även på dator.

- **Fri 3D-modellering med låsta mått**
  - **Virke** (konstruktionsvirke, hyvlat, tryckimpregnerat, läkt): en 45x70
    är alltid 45x70, bara längden kan ändras.
  - **Skivor** (plywood, MDF, OSB): tjockleken är låst, längd och bredd är fria.
- **Placera genom att trycka**: välj en bräda och tryck där den ska sitta.
  På en brädas sida ställs den nya rakt ut (som en stolpe) och fäster vid
  början, mitten eller änden; på en brädas ände vrids den 90° (som en
  överliggare). Längden anpassas: en stolpe fyller upp till delen ovanför,
  en överliggare spänner över stolparna. En ram tar fem tryck.
- Flytta med pilarna i 3D-vyn. Delar **fäster mot
  varandra** (kant mot kant, i liv) och mot ett rutnät på 1–100 mm.
- **Mått i 3D-vyn** för markerad del, eller totalmått när inget är markerat.
- Rotera i 90°-steg, duplicera, ångra/gör om, "visa hela modellen".
- **Två lägen: Bygg och Redigera.** I *Bygg* markerar varje tryck en hel
  grupp och lägger till den i markeringen; en list längst ner har
  Gruppera, Flytta, Vrid, Kopiera och Ta bort. I *Redigera* väljer ett tryck
  en enskild del och visar dess detaljer (längd, ändar, fogar).
- **Flytta** med pilar direkt i 3D-modellen (ett steg per tryck, 1–100 mm
  eller valfritt), eller tryck på en bräda för att flytta dit, kant i kant.
  Fri dragning finns under Avancerat i menyn.
- **Byt stötfog**: markera en ram (eller två brädor i ett rakt hörn) och tryck
  ⇄ — t.ex. går sidorna igenom i stället för över- och underdelen. Ramens
  yttermått behålls; brädorna kapas om (längre eller kortare).
- **Ändra avstånd direkt i 3D-vyn**: tryck på ett grönt mått (fritt
  avstånd till golvet eller nästa del) och skriv in hur stort det ska vara —
  markeringen flyttas dit.
- **Vrid** i steg om 90° — tryck på pilarna på ringarna runt markeringen
  i 3D-vyn, eller på Vrid / Tippa / Sida i listen. Det som står på golvet
  blir stående på golvet.
- **Grupper** (t.ex. "Ben", "Sits"): ett tryck markerar hela gruppen.
- **Fogar** när delar går in i varandra: *Kapa mot* (stumt, kortar
  kaplängden), *Urtag*, *Halvt i halvt* och *Gering* (hörn som möts i
  diagonalen). Urtagen syns i 3D och står med mått i såglistan och
  utskriften.
- **Sneda ändar**: gering (över sidan) eller fas (över kanten) i valfri
  vinkel i varje ände. Längden mäts på långsidan.
- **Fritt utrymme och riktvärden**: markera en del och se fritt utrymme åt
  alla håll (till närmaste del eller golvet) och om höjden passar som t.ex.
  matbord, sittbänk eller arbetsbänk.
- **Mät** (📏 i 3D-vyn): tryck på två ytor eller golvet. Mäter rakt ut från
  första ytan (höjd, fritt mellan hyllor, längd) eller längs ytan om båda
  tryck är på samma yta. Varje mått jämförs med vanliga riktvärden.
- **Fästpunkter (snapping)**: mätverktyget fäster mot hörn, kantmitt,
  ytans mitt och delens mitt (för c/c-mått); knappen överst byter mellan
  alternativen. När delar flyttas fäster de yta mot yta och mitt mot mitt,
  med en hjälplinje. Vad som fästs väljs i menyn.
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
dessutom varje måndag. Prisfilen sparas inte i repot. Misslyckas hämtningen
publiceras appen ändå; den visar då att butikspriser saknas och använder
egna priser.

Hornbach blockerar automatiska anrop (bot-skydd även på robots.txt), så
deras priser hämtas inte, och vi försöker inte ta oss förbi skyddet.

### Om prisuppgifterna

- Endast faktauppgifter hämtas: produktnamn, mått och pris. Inga bilder
  eller texter.
- Ett litet urval (virke och skivor), varje pris länkar tillbaka till
  butikens produktsida.
- Snickerei är ett fritt, icke-kommersiellt hobbyprojekt och har ingen
  koppling till Bauhaus eller andra butiker.
- **Företräder du en butik och vill att vi slutar hämta era priser?** Öppna
  ett ärende (issue) i det här repot så tar vi bort er direkt.

## Licens

Koden är fri att använda under [MIT-licensen](LICENSE). Licensen gäller
koden — inte prisuppgifterna, som tillhör respektive butik.

## Publicering

GitHub Actions bygger och publicerar till GitHub Pages vid varje push till
`main` (`.github/workflows/deploy.yml`). Engångsinställning: repots
**Settings → Pages → Source: GitHub Actions**.

## Kom igång

```bash
npm install
npm run prices   # hämta butikspriser (behövs en gång för priser lokalt)
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
