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
- **Fyra steg, var och ett i sin färg**: 1 Bygg (lägg till och placera,
  grupper, ramar) · 2 Detaljer (längder, ändar, urtag, håller det?) ·
  3 Montering (steg för steg, skruv) · 4 Inköp (såglista, inköpslista,
  priser, och en **kontroll före köp**: krockar, delar som svävar, svaga
  hyllor, skruv man inte kommer åt, brädor längre än butiken säljer och
  saknade priser — med ett ! i 3D-modellen som man trycker på för att se
  vad som är fel och hoppa till steget där det fixas). Hoppa fritt mellan stegen — modellen går att ändra i alla.
  I *Bygg* markerar ett tryck en hel grupp och en list har Gruppera,
  Flytta, Vrid, Spegla, Kopiera och Ta bort. I *Detaljer* väljer ett tryck
  en enskild del och visar dess längd, ändar och fogar.
- **Flytta** med pilar direkt i 3D-modellen (ett steg per tryck, 1–100 mm
  eller valfritt), eller tryck på en bräda för att flytta dit, kant i kant.
  Fri dragning finns under Avancerat i menyn.
- **Spegla**: markera t.ex. ena gaveln och tryck ⇋ Spegla — välj riktning
  och gör en spegelkopia på andra sidan (eller vänd delarna på plats).
  Geringar, urtag och fransk list speglas också.
- **Lås, röntgen och markera likadana**: 🔒 Lås gör att en del inte kan
  markeras eller flyttas av misstag (tryck går igenom till det bakom).
  👓 Röntgen gör allt utom det markerade genomskinligt. ▣ Alla 45×95
  markerar alla delar av samma virke (eller samma längd).
- **Byt stötfog**: markera en ram (eller två brädor i ett rakt hörn) och tryck
  ⇄ — t.ex. går sidorna igenom i stället för över- och underdelen. Ramens
  yttermått behålls; brädorna kapas om (längre eller kortare).
- **Skiva först, ram sedan**: lägg en skiva (två tryck, hörn till hörn),
  markera den och tryck ▦ Bygg ram under skivan — välj virke, högkant eller
  flatt och hur många tvärreglar.
- **Skruv**: under Listor föreslås skruv för varje fog — typ, mått, antal,
  om det går i ändträ och om du ska förborra (och med vilken borr) — plus
  en summering att köpa. Förslag efter tumregler.
- **Analys**: välj vad det ska bli (bokhylla, bord, bänk …) och se vikt,
  hur mycket varje hylla eller regel böjer och klarar, om bygget tippar och
  om det vickar i sidled — även som färger i 3D-vyn. Det är en
  uppskattning med typvärden, ingen hållfasthetsberäkning.
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
- **Priser**: egna priser (kr/lm, kr/skiva) som du skriver in; inköpslistan
  väljer billigaste kombinationen av längder och skivstorlekar.
  Exempelpriser (inte riktiga) kan användas där inget eget pris finns.
- Sparas automatiskt i webbläsaren; exportera/importera projektfil (JSON).
- Kan läggas till på hemskärmen och öppnas som en app.

## Priser

Butikspriser hämtas inte för närvarande. Tanken är att hämta dem först när
du väljer en butik, via en liten Cloudflare Worker (webbläsaren kan inte
läsa butikernas sidor direkt). Tills dess används egna priser och
exempelpriser.

Skriptet `npm run prices` (Bauhaus kategorisidor, 16 anrop med 2 s paus,
bara sidor som robots.txt tillåter) finns kvar och kan köras lokalt; det
körs inte vid publicering. Hornbach blockerar automatiska anrop och hämtas
inte, och vi försöker inte ta oss förbi skyddet.

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
npm run prices   # hämta Bauhaus-priser lokalt (används inte vid publicering)
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
