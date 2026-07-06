# Listing Radar, Handoff-Spec für Claude in VS Code

Private App zum Scrapen, Vereinheitlichen und Vergleichen von Inseraten in drei Ansichten:
**Häuser** und **Grundstücke** (Umgebung Zadar/Kroatien) sowie **Autos** (Deutschland).
Datenbeschaffung läuft so weit wie möglich über Apify, die App läuft auf Vercel und ist nur für den Eigentümer zugänglich.

Diese Datei ist die Arbeitsgrundlage. Bitte Abschnitt "Build-Reihenfolge" der Reihe nach abarbeiten
und bei jedem Meilenstein committen.

---

## 1. Grundprinzip

Alle Quellen werden zu **Apify-Actors** gemacht, damit sie einheitlich laufen, geplant und per Webhook
ausgeliefert werden:

- **Njuškalo** (Häuser + Grundstücke): fertiger Apify-Actor.
- **Index Oglasi** (Häuser + Grundstücke): kein fertiger Actor vorhanden, also **eigener Crawlee-Actor**.
- **AutoScout24** (Autos): fertiger Apify-Actor.
- **mobile.de** (Autos): fertiger Apify-Actor.
- **AutoHero** (Autos): kein fertiger Actor bekannt, also ebenfalls **eigener Crawlee-Actor**. Technisch eher
  einfacher als Index Oglasi, da AutoHero eine feste Händler-Inventarliste ist (Auto1-Gruppe), keine wechselnden
  privaten Inserate mit unterschiedlichen Formaten.

Alle eigenen Actors werden ebenfalls auf Apify deployed, damit der gesamte Datenfluss identisch bleibt.

Die Vercel-App scrapt selbst **nicht**. Sie nimmt fertige Daten entgegen, normalisiert, dedupliziert,
bewertet (inkl. KI) und zeigt an. Vercel ist serverless und nicht für lange Scraping-Jobs geeignet,
deshalb diese Trennung.

Datenfluss:

```
Apify Actor (geplant 1-2x/Tag)
  -> Apify Dataset
  -> Webhook bei Erfolg an  POST /api/ingest
  -> App liest Dataset, normalisiert, dedupt, scort, schreibt in Postgres
  -> KI-Anreicherung (Bildbewertung / Auto-Recherche) als eigener Schritt
  -> Frontend liest aus Postgres
```

---

## 2. Tech-Stack (bewusst auf Tempo optimiert)

- **Next.js (App Router) + TypeScript**, deployed auf **Vercel**.
- **Tailwind CSS + shadcn/ui** fürs Frontend.
- **Postgres** über **Neon** oder **Supabase** (Free Tier reicht). ORM: **Prisma**.
- **apify-client** (npm) zum Triggern von Runs und Lesen von Datasets.
- **Apify Scheduler + Webhooks** für die zeitgesteuerten Läufe.
- Eigener Index-Oglasi-Actor mit **Crawlee (TypeScript)**, Deploy via Apify CLI.
- **Anthropic SDK** (server-side) für KI-Bildbewertung und Auto-Recherche.

Auth: keine Anmeldung nötig. Die App läuft auf einer unlisted Vercel-URL (also nicht öffentlich beworben,
aber technisch ohne Login erreichbar). Der Link kann formlos an den Vater und ein bis zwei weitere Personen
weitergegeben werden. Kein Passwortschutz, kein Nutzerkonto, kein Aufwand. Falls später doch gewünscht,
kann jederzeit Vercel Password Protection nachgerüstet werden.

**Offene Frage dazu:** Favoriten/raus/gesehen-Flags, siehe Abschnitt 4, sollen die für alle gemeinsam gelten
(einer markiert "Favorit", alle sehen es so), oder soll jede Person ihre eigenen Flags haben? Das ändert
das Datenbankschema, deshalb bitte vorab festlegen. Default in dieser Spec: **gemeinsame Flags für alle**,
weil es eine kleine, vertraute Gruppe ist und die Objekte gemeinsam bewertet werden.

---

## 3. Repo-Struktur (Monorepo)

```
listing-radar/
  apps/
    web/
      app/
        houses/           # Ansicht Häuser
        land/             # Ansicht Grundstücke
        cars/             # Ansicht Autos
        compare/          # Vergleichsansicht
        api/
          ingest/         # nimmt Apify-Webhooks entgegen
          enrich/         # KI-Bildbewertung + Auto-Recherche
          trigger/        # optionaler manueller Trigger
      lib/
        apify.ts
        config.ts         # alle Filter + Orte + Gewichte zentral
        normalize/        # ein Mapper pro Quelle
        dedupe.ts
        score.ts
        ai/               # Bildbewertung, Recherche
      prisma/
        schema.prisma
  actors/
    index-oglasi/         # eigener Crawlee-Actor, Häuser + Grundstücke
    autohero/             # eigener Crawlee-Actor, Autos
  SPEC.md
  .env.example
```

Start mit `git init`, früh ein erstes Deploy auf Vercel (Hello World mit aktivem Passwortschutz).

---

## 4. Normalisiertes Datenmodell

Jede Quelle liefert andere Feldnamen, alles wird auf EIN Schema gemappt. Exakte Output-Felder jedes Actors
vor dem Mapping einmal real prüfen (Test-Run), Feldnamen können abweichen.

```ts
type Source = "njuskalo" | "indexoglasi" | "autoscout24" | "mobilede" | "autohero";
type Vertical = "house" | "land" | "car";

interface BaseListing {
  id: string;              // Hash aus source + sourceListingId
  source: Source;
  sourceListingId: string;
  vertical: Vertical;
  url: string;
  title: string;
  priceEur: number;
  images: string[];        // Bild-URLs vom Portal-CDN
  description?: string;
  location: { raw: string; city?: string; region?: string; lat?: number; lng?: number };
  postedAt?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  status: "active" | "gone";
  priceHistory: { date: string; priceEur: number }[];
  displayPriceEur?: number;      // siehe Abschnitt 9, Fake-Preis-Handling
  priceOnRequest: boolean;       // true, wenn kein echter Preis gefunden wurde
  score: number;                 // 0-100, berechneter Gesamt-Score (alles zusammen, siehe Abschnitt 5)
  scoreBreakdown: ScoreReason[]; // Pluspunkte und Minuspunkte, für die Anzeige
  scoreOverride?: number;        // manuell von dir gesetzt, überschreibt score in der Anzeige
  scoreOverrideNote?: string;
  aiImageScore?: number;         // 0-100, nur Häuser/Grundstücke
  aiImageNotes?: string;
  aiFairPriceEstimate?: number;  // nur bei priceOnRequest, siehe Abschnitt 9
  raw: unknown;
}

interface ScoreReason {
  label: string;      // z. B. "Preis pro m² sehr gut", "Ort eher schwach"
  points: number;     // positiv oder negativ
}

interface HouseFields {
  areaLivingM2?: number;
  areaPlotM2?: number;
  rooms?: number;              // Wohnräume ohne Küche/Bad, siehe Hinweis unten zur Zähllogik
  bathroomCount?: number;      // separat erfasst, ideal 1-2
  yearBuilt?: number;
  yearRenovated?: number;
  hasGarden?: boolean;
  hasPool?: boolean;
  hasAuxiliaryBuilding?: boolean;   // z. B. Sommerküche, Gästehaus
  hasParkingSpot?: boolean;         // offener Stellplatz, wichtig
  hasGarage?: boolean;              // nice to have
  hasAirConditioning?: boolean;     // starkes Plus
  heatingType?: string;             // informativ, z. B. "Wärmepumpe", "Klima", falls erwähnt
  renovationNeeded?: "none" | "light" | "moderate" | "heavy"; // aus Beschreibung/Bildern abgeleitet
  hasSeaViewLikely?: boolean;     // aus Beschreibung/Bildern abgeleitet, siehe Abschnitt 9
  looksLikeTouristRental?: boolean; // aus Beschreibung/Bildern abgeleitet, siehe Abschnitt 9
  locationScore?: number;      // 1-10, aus lib/config.ts Ortstabelle (siehe ORTE_LOCATION_SCORE.md)
  pricePerLivingM2?: number;   // abgeleitet
  pricePerPlotM2?: number;     // abgeleitet, zum Vergleich zusätzlich zu pricePerLivingM2
}
```

**Hinweis zur Zimmerzahl:** Kroatische Portale zählen uneinteig, manche geben "3+1" an (3 Zimmer plus Küche
als die "+1"), andere zählen die Küche nicht mit. Der Normalizer muss pro Quelle genau prüfen, was gemeint ist,
damit `rooms` überall dasselbe bedeutet: reine Wohn-/Schlafräume, ohne Küche, ohne Bad. Bäder werden separat
in `bathroomCount` erfasst. Minimum ist `rooms >= 3`, ideal sind 4 Zimmer (gibt zusätzliche Pluspunkte),
plus `bathroomCount >= 1`, ideal 2.

```ts

interface LandFields {
  areaPlotM2?: number;
  zoningStated: boolean;              // true, wenn das Portal/die Beschreibung überhaupt eine Zonierung nennt
  zoningConfirmedBuildingLand: boolean; // true nur, wenn Baugrund klar bestätigt ist
  locationScore?: number;             // 1-10, aus lib/config.ts Ortstabelle
  pricePerM2?: number;                // abgeleitet, auf Basis von displayPriceEur
}

interface CarFields {
  make?: string;
  model?: string;
  variant?: string;
  firstRegistrationYear?: number;   // Erstzulassung
  firstRegistrationMonth?: number;
  mileageKm?: number;
  fuel?: "diesel" | "petrol" | "hybrid_petrol" | "hybrid_diesel" | "electric" | "other";
  rangeKm?: number;                 // nur bei electric relevant, muss >= 500 sein
  transmission?: "manual" | "automatic";
  powerPs?: number;
  bodyType?: "limousine" | "sportback" | "suv" | "suv_coupe" | "kombi" | "other";
  distanceFromIsmaningKm?: number;  // abgeleitet
  hasAdaptiveCruiseControl?: boolean;   // aus Beschreibung/Ausstattung erkannt
  hasParkingCamera?: boolean;           // aus Beschreibung/Ausstattung erkannt
  infotainmentGeneration?: "latest" | "previous" | "older" | "unknown"; // siehe Abschnitt 9
  monthlyFinancingEur?: number;     // abgeleitet, siehe Finanzierungs-Rechner Abschnitt 5
}
```

User-Flags (Favorit, raus, gesehen) in eigener Tabelle, damit Re-Imports sie nicht überschreiben.

---

## 5. Filter und Scoring

Filter sind **Hard** (fliegt raus) oder **Soft** (beeinflusst nur den Score). Alles aus `lib/config.ts`.
Orte mit und ohne kroatische Diakritika matchen (normalisieren), Portale schreiben uneinheitlich.

### Orte (gilt für Häuser UND Grundstücke)

```
Zadar, Bibinje, Sukosan, Kozino, Sveti Petar na Moru, Petrcane, Zaton, Nin,
Vrsi, Privlaka, Razanac, Ljubac, Diklo, Radovin, Poljica, Jovici
```
(Hinweis: Zadar ist diesmal ausdrücklich eingeschlossen.)

### Wichtig: EIN Gesamt-Score, keine Einzel-Scores

Zentrale Anforderung: du willst pro Inserat **einen einzigen Score** sehen (0-100), der alles zusammenfasst,
Preis, Lage, Ausstattung, Bildqualität. Kein separater Location-Score und Preis-Score nebeneinander.
Darunter dann die **Pluspunkte und Minuspunkte** als kurze Liste (`scoreBreakdown`), die erklären, wie der
Score zustande kam. Beispiel-Darstellung in der Karte:

```
Score: 84/100
+ Sehr gutes Preis/m² (73 Euro/m²)
+ Ort Sukošan, gute Infrastruktur
+ Über 700 m², passt zum Sweet Spot
- Hanglage laut Bildern
```

Der Score ist zusätzlich **manuell überschreibbar** (`scoreOverride`), das wird gespeichert und übersteht
neue Scraping-Läufe. So kannst du sagen "der Score ist mir zu hoch" und den Wert direkt anpassen.

### Häuser

Hard (fliegt komplett raus):
- Ort in Allowlist
- `priceEur` zwischen `100000` und `400000`
- `areaLivingM2 >= 80`
- `rooms >= 3` (reine Wohnräume ohne Küche/Bad, siehe Hinweis in Abschnitt 4)

Fließt in den Gesamt-Score ein (Auszug, Gewichte in `config.ts` einstellbar):
- niedriger `pricePerLivingM2` UND niedriger `pricePerPlotM2` (beide werden verglichen, stärkstes Gewicht)
- `locationScore` aus der Ortstabelle
- `areaLivingM2` im Sweet Spot 80 bis 140 m² (darüber neutral, kein Abzug, aber auch kein Extra-Bonus)
- `areaPlotM2` im Sweet Spot 300 bis 400 m² (Garten soll wirklich nutzbar sein)
- `rooms === 4` gibt zusätzliches Plus gegenüber der Minimum-Schwelle von 3
- `bathroomCount >= 1`, zusätzliches Plus bei `bathroomCount >= 2`
- `hasGarden === true`
- `hasParkingSpot === true` (starkes Plus, du erwartest das eigentlich als gegeben)
- `hasGarage === true` (leichtes Plus, nice to have)
- `hasPool === true`, falls erwähnt (Plus, aber kein Ausschluss ohne)
- `hasAuxiliaryBuilding === true` (z. B. Sommerküche/Gästehaus, Plus)
- `hasAirConditioning === true` (starkes Plus)
- **Baujahr/Renovierung, gestuft statt binär**: je neuer, desto besser. `yearBuilt >= 2020` ODER
  `yearRenovated >= 2020` gibt die Basis-Pluspunkte, `>= 2022` gibt nochmal mehr, `>= 2024` das Maximum.
- `renovationNeeded === "none"` oder `"light"`: neutral bis leichtes Plus. `"moderate"`: leichter Abzug,
  aber kein Ausschluss, falls Bausubstanz laut Bildern gut aussieht. `"heavy"`: deutlicher Abzug.
- `hasSeaViewLikely === true` (aus Beschreibung/Bildern, siehe Abschnitt 9): Plus, aber erwartungsgemäß selten
  in diesem Preis-/Ortssegment, kein Ausschluss ohne.
- `looksLikeTouristRental === true`: leichter Minuspunkt (normales Wohnhaus gewünscht, keine Ferienvilla-Optik).
- guter `aiImageScore` (siehe Abschnitt 9)

Die Ortstabelle (`locationScore`) ist identisch zu der bei Grundstücken, gleiche Rangfolge, keine separate
Innerorts-Unterscheidung (Zentrum vs. ruhiger Ortsteil) nötig, das deckt die Ortstabelle schon ausreichend ab.

### Grundstücke

Hard (fliegt komplett raus):
- Ort in Allowlist
- `zoningConfirmedBuildingLand === false` und `zoningStated === true`, also eindeutig KEIN Baugrund
- Preis-Bedingung erfüllt, eine von beiden reicht (auf Basis von `displayPriceEur`, siehe Abschnitt 9):
  - `priceEur` zwischen `10000` und `110000`, ODER
  - `pricePerM2 <= 100`

Fließt in den Gesamt-Score ein:
- niedriger `pricePerM2` (stärkstes Gewicht)
- `locationScore` aus der Ortstabelle
- Größe nahe am Sweet Spot 700-800 m² (bei 400 m² Minimum)
- guter `aiImageScore`

### Autos

Hard (fliegt komplett raus):
- `priceEur` zwischen `18000` und `30000` (aktualisiert, Verkaufserlös aktuelles Auto eher 18000-19000)
- `firstRegistrationYear >= 2023` (aktualisiert, vorher 2022)
- `transmission === "automatic"`
- `powerPs >= 110` (aktualisiert, vorher 130. Ideal sind 150 PS oder mehr, siehe Soft-Kriterien)
- `mileageKm <= 70000`
- `distanceFromIsmaningKm <= 200` (Umkreis um Ismaning, PLZ 85737, echtes Ausschlusskriterium)
- `fuel` in [diesel, hybrid_petrol, hybrid_diesel, electric]. Bei `electric` zusätzlich `rangeKm >= 500`.
  Reiner Benziner ohne Hybrid ist damit raus.

Fließt in den Gesamt-Score ein:
- `make` in [Audi, BMW, Mercedes] leicht bevorzugt, aber alle Marken grundsätzlich willkommen (kein Ausschluss).
- Karosserie: `bodyType === "limousine"` (Stufenheck) bevorzugt. `bodyType === "sportback"` (Fließheck) ist
  unerwünscht, aber kein Ausschluss, gibt Minuspunkte. `bodyType === "suv"` ist willkommen, wenn das Fahrzeug
  nicht zu groß ist UND ein abfallendes, limousinenartiges Heck hat (Coupé-SUV-Stil, z. B. BMW X4/X6-artig,
  Mercedes GLC Coupé), klassische kastenförmige SUVs geben Minuspunkte.
- `powerPs >= 150` gibt zusätzliche Pluspunkte (aktueller Wagen hat 150 PS, das ist die Wunsch-Referenz).
- niedrigere `mileageKm` innerhalb der 70000er-Grenze.
- neueres Zulassungsjahr, niedrigerer Preis im Band.
- **Adaptiver Tempomat/Abstandstempomat** (ACC), aus Beschreibung/Ausstattungsliste erkannt: starkes Plus.
  Bewusst als Soft-Kriterium mit hohem Gewicht statt Hard-Filter, weil Ausstattungslisten je nach Portal
  unterschiedlich vollständig und unterschiedlich benannt sind ("Active Cruise Control", "ACC",
  "Abstandstempomat" etc.). Ein Hard-Filter würde riskieren, gute Autos rauszuwerfen, nur weil das Portal
  die Ausstattung nicht vollständig gelistet hat. Bei zu wenig Treffern kann das später nachgeschärft werden.
- **Einparkhilfe mit Kamera**, aus Beschreibung/Ausstattungsliste erkannt: moderates Plus.
- **Modernstes Infotainment/Entertainment-System für das Modell**, siehe Abschnitt 9. Starkes Plus, wenn
  bestätigt neuestes Facelift/neueste Generation, neutral bis leicht negativ, wenn erkennbar älteres System.
- Unfallhistorie oder sichtbare Kratzer/Schäden, aus Beschreibung erkannt: **leichter Minuspunkt**, moderates
  Gewicht, kein Ausschluss und kein starker Abzug, aber fließt sichtbar in `scoreBreakdown` ein.

`score.ts`: gewichtete Summe je Vertical, normalisiert auf 0-100, plus `scoreBreakdown` mit den
wichtigsten 3-5 Gründen, positiv und negativ. Gewichte als benannte Konstanten in `config.ts`,
damit du sie leicht justieren kannst, bevor du `scoreOverride` von Hand nutzt.

### Finanzierungs-Rechner (Autos, pro Inserat)

Auf der Auto-Detailseite direkt sichtbar, ohne Klick auf "Recherche":
- Eingabe (einmalig in `config.ts`, dann fix): `ownFundsEur` (voraussichtlicher Verkaufserlös aktuelles
  Auto, Default 18500), `maxLoanEur` (Default 12000), `loanTermMonths` (Default 48).
- Zinssatz: Default-Annahme **7 % effektiver Jahreszins** (aktueller Marktdurchschnitt für Ratenkredite
  10000-30000 Euro, Stand Juli 2026, laut Verivox/Vergleich.de). Als einstellbarer Wert in `config.ts`,
  klar mit Hinweis "Richtwert, hängt von Bonität ab, bitte bei Bank/Vergleichsportal verifizieren".
- Berechnung pro Inserat: `loanAmount = max(0, priceEur - ownFundsEur)`, gedeckelt auf `maxLoanEur`
  (wenn `loanAmount > maxLoanEur`, Warnhinweis "übersteigt dein Kredit-Limit" anzeigen statt zu rechnen).
- Standard-Annuitätenformel für die Monatsrate, mit `loanAmount`, Zinssatz und `loanTermMonths`.
- Anzeige direkt unter dem Preis: z. B. "Finanzierung: ca. 245 Euro/Monat bei 9500 Euro Kredit über 48 Monate".

---

## 6. Dedupe

Dasselbe Objekt taucht oft auf beiden Portalen auf. Für v1 nicht hart mergen, sondern als mögliches Duplikat markieren:
- Kandidaten-Key aus gerundetem Preis + Fläche (bzw. km) + Stadt.
- Optional perceptual hash des ersten Bildes (`sharp` + dHash), Schwellwert vergleichen.
- Im Frontend Duplikate gruppieren, nur das günstigste/vollständigste prominent zeigen.

---

## 7. Apify-Integration

### Empfohlene fertige Actors (Input-Schema und Output-Felder vor Einsatz real prüfen)

- Njuškalo: `logiover/njuskalo-hr-property-scraper` (parst Ort bis Mikro-Lage, Preis EUR, Fläche, Bilder),
  Alternative `memo23/njuskalo-scraper`. Deckt Häuser und Grundstücke ab.
- AutoScout24: `memo23/autoscout24-scraper` oder `solidcode/autoscout24-scraper`.
- mobile.de: `memo23/mobile-de-scraper` (Incremental/Monitoring-Mode, gut für tägliche Läufe).
- Index Oglasi und AutoHero: kein fertiger Actor gefunden (Stand dieser Spec), beide werden als eigene
  Crawlee-Actors gebaut, siehe Abschnitt 8.

Actor-Input eng konfigurieren: Orte/Region, Preis, Fläche, bei Autos Standort Ismaning + Radius 200 km,
Zulassung, Getriebe, Leistung. So filtert Apify vor und es fallen weniger Daten an.

### `lib/apify.ts`
- `triggerActor(actorId, input)`
- `getDatasetItems(datasetId)` mit Pagination
- Token aus `APIFY_TOKEN`.

### `POST /api/ingest`
1. Secret gegen `INGEST_SECRET` prüfen.
2. `datasetId` aus Webhook-Payload lesen.
3. Items holen, Normalizer nach `source` wählen.
4. Normalisieren, Score berechnen, Dedupe-Key setzen.
5. Upsert in Postgres, `lastSeenAt` aktualisieren, `priceHistory` bei Preisänderung ergänzen.
6. Fehlende Inserate der Quelle auf `status = "gone"` setzen.
7. Neue Häuser/Grundstücke zur KI-Bildbewertung einreihen (Abschnitt 9).

### Scheduling
- In Apify pro Actor einen Schedule (Autos 2x/Tag, Immobilien 1x/Tag reicht).
- Webhook "Run succeeded" -> `https://DEINE-APP.vercel.app/api/ingest?source=...&secret=...`
- Optional Vercel Cron als Fallback-Trigger.

---

## 8. Eigene Actors (`actors/index-oglasi`, `actors/autohero`)

### Index Oglasi (Häuser + Grundstücke)
- **Crawlee (TypeScript)**, HTTP-Crawler wenn möglich, sonst Playwright bei JS-Rendering.
- Input: Region Zadar-Orte, Kategorie Haus bzw. Baugrund, Preis-Bereich.
- Zwei Stufen: Suchergebnis-Seiten paginieren, dann Detailseiten.
- Output im gleichen Feld-Stil wie die anderen Quellen, damit der Normalizer minimal bleibt.

### AutoHero (Autos)
- Ebenfalls **Crawlee (TypeScript)**. Da AutoHero eine feste Händler-Inventarliste ist (keine wechselnden
  privaten Inserate), reicht meist ein HTTP-Crawler ohne Login, Paginierung über die Fahrzeug-Suchergebnisse,
  dann Detailseiten für die vollständigen Ausstattungsmerkmale (wichtig für ACC/Kamera-Erkennung, Abschnitt 5).
- Input: Preis-Bereich, Erstzulassung, Getriebe, Standort/Radius, wie bei den anderen Auto-Quellen.
- Output im gleichen Feld-Stil wie AutoScout24/mobile.de.

Beide Actors:
- Apify-Proxy, moderate Concurrency, höfliche Delays.
- Deploy via `apify push`, danach gleicher Schedule- und Webhook-Flow wie die fertigen Actors.

---

## 9. KI-Features

Budget-Vorgabe: KI-Kosten sollen klein bleiben, im Bereich 5 bis 10 Euro im Monat für alles zusammen
(API plus Hosting/DB). Deshalb überall das güntigste ausreichende Modell verwenden, nicht das teuerste.

### Preis-Erkennung (Häuser + Grundstücke), läuft VOR dem Scoring
Portale wie Njuskalo zeigen manchmal einen Fake-Preis (z. B. 1 Euro), der echte Preis oder "Preis auf
Anfrage" steht dann im Titel oder in der Beschreibung, oft auf Kroatisch ("cijena na upit" = Preis auf Anfrage).
Ablauf in `api/enrich`, bevor irgendetwas anderes berechnet wird:
1. Regelbasiert prüfen: ist der gemeldete Preis unplausibel niedrig (z. B. unter 1000 Euro bei Häusern/Grundstücken)?
2. Falls ja: Titel und Beschreibung nach einer echten Preisangabe durchsuchen (Regex plus kleines Sprachmodell
   für die Fälle, die Regex nicht fängt). Gefundener Preis wird `displayPriceEur`, mit Hinweis "Preis aus Beschreibung".
3. Falls kein Preis gefunden wird und stattdessen "Preis auf Anfrage" (oder Äquivalent) erkannt wird:
   `priceOnRequest = true`. Die Anzeige zeigt dann prominent **"Preis auf Anfrage"** an erster Stelle, dazu
   in Klammern eine KI-Schätzung `aiFairPriceEstimate`, basierend auf vergleichbaren Inseraten der gleichen
   Größe und Lage. Klar als Schätzung kennzeichnen, keine echte Zahl vom Verkäufer.
4. Alle Preis-basierten Hard-Filter und der Score rechnen ab hier mit `displayPriceEur` (nicht mit dem
   rohen `priceEur` vom Portal).

### Kategorie-Check bei Grundstücken
Titel und Beschreibung werden daraufhin geprüft, ob die Portal-Kategorie ("Baugrund") zur echten Nutzung passt.
Falls die Beschreibung klar etwas anderes sagt (z. B. Ackerland, landwirtschaftliche Fläche), wird
`zoningConfirmedBuildingLand = false` gesetzt, das Inserat fliegt komplett raus (siehe Abschnitt 5).
Steht gar nichts zur Zonierung da (`zoningStated = false`), wird das Inserat trotzdem angezeigt, aber im
Score leicht abgewertet und mit Hinweis "Zonierung unklar, bitte selbst prüfen" markiert. Kein Ausschluss,
nur Vorsicht.

### Bildbewertung (Häuser + Grundstücke)
- In `api/enrich` die Bild-URLs eines Inserats an ein günstiges vision-fähiges Modell schicken (Anthropic SDK,
  server-side, `ANTHROPIC_API_KEY`, kleinstes Modell mit Bildverständnis, kein Flagship-Modell nötig).
- Modell bewertet Zustand, Modernität, sichtbare Renovierung, Licht/Lage-Eindruck, bei Grundstücken Lage/Zuschnitt/Hanglage.
- Bei Häusern zusätzlich: `hasSeaViewLikely` (zeigen Fenster-/Balkon-/Terrassenfotos erkennbar Meer oder
  Küstenlinie?), `looksLikeTouristRental` (wirkt das Haus/die Einrichtung wie eine auf Ferienvermietung
  ausgelegte Villa, z. B. sehr resortartige Poolgestaltung, unpersönliche Hotel-Optik, statt normales Wohnhaus?),
  und `renovationNeeded` (Einschätzung "none/light/moderate/heavy" anhand von Zustand, sichtbaren Schäden,
  Alter von Küche/Bad auf den Fotos). Alle drei Signale zusätzlich aus der Beschreibung abgleichen (z. B.
  Stichworte wie "turistički objekt", "rental income", "apartmani", "potrebna renovacija").
- Rückgabe als `aiImageScore` (0-100) + kurze `aiImageNotes`.
- Kostenkontrolle: nur Inserate bewerten, die die Hard-Filter bestehen, und je Inserat nur die ersten N Bilder (z. B. 5).
- `aiImageScore` fließt in den Gesamt-Score ein (Abschnitt 5), nicht als eigener separater Score.
- Läuft einmal beim ersten Erscheinen. Erneut nur, falls sich Bilder oder Beschreibung im Re-Scrape ändern.

### Score-Override (manuell)
Auf der Karte/Detailseite ein einfacher Regler oder Eingabefeld, um `scoreOverride` zu setzen, optional mit
`scoreOverrideNote`. Wird gespeichert, übersteht neue Scraping-Läufe, überschreibt die Anzeige des berechneten
Scores (der berechnete Wert bleibt im Hintergrund erhalten, für Nachvollziehbarkeit).

### Auto-Recherche (on demand pro Inserat)
Button "Recherche" auf der Auto-Detailseite ruft `api/enrich` auf und liefert:
- **Versicherung, grobe Schätzung** für das Profil: 26 Jahre, 9 Jahre Fahrerlaubnis, angestellt, Tiefgarage,
  ADAC-Mitglied, SF 3, Wohnort Ismaning. Klar als unverbindliche Schätzung kennzeichnen, kein echtes Angebot.
- **Modell-Alter und Facelift**: aktuelle Generation, Alter des Modells, bekannter oder erwarteter nächster Facelift.
- Grobe Einschätzung "günstig / normal / teuer" im Vergleich zu ähnlichen Angeboten (kein exakter Vergleichspreis-Katalog,
  das wäre zu aufwendig für den Rahmen, aber die einfache Einschätzung ist enthalten).
- Umsetzung: Anthropic SDK mit aktivierter Websuche, Ergebnis cachen (pro Modell/Variante), damit es nicht jedes Mal neu recherchiert.

### Infotainment/Facelift-Bewertung anhand der Bilder (Autos, wichtig für Wertstabilität)
Deine These: das Auto hält den Wert besser, wenn beim Kauf schon das neueste Infotainment-System verbaut ist
(nicht das vom vorherigen Facelift). Deshalb, automatisch bei jedem neuen Auto-Inserat, das die Hard-Filter besteht:
1. Aus der Auto-Recherche (siehe oben) wird das Facelift-Timing für Marke/Modell/Baujahr recherchiert und gecacht
   (z. B. "Modell X, Facelift 2023, neues Infotainment-System Y ab da verbaut").
2. Innenraum-/Armaturenbrett-Fotos des Inserats werden an das gleiche günstige Vision-Modell wie bei Häusern/
   Grundstücken geschickt (Kostenrahmen bleibt gleich), mit der Frage: "Zeigt dieses Bild das Infotainment-System
   der neuesten oder einer älteren Generation für dieses Modell?"
3. Ergebnis wird zu `infotainmentGeneration` ("latest", "previous", "older", oder "unknown" falls keine
   brauchbaren Innenraumfotos vorhanden sind), fließt als starkes Plus (bei "latest") in den Score ein.

### Push-Benachrichtigungen
- Web Push (Service Worker plus VAPID-Keys), funktioniert ohne Login, pro Gerät/Browser abonniert.
- Auslöser: neues Inserat, das die Hard-Filter besteht (unabhängig vom Score), und Preissenkungen bei
  bereits gesehenen Inseraten.
- Wird direkt nach `POST /api/ingest` ausgelöst, wenn neue oder preisreduzierte Datensätze erkannt wurden.

---

## 10. Status der Filter

- Alle Filter sind final festgelegt, keine offenen Punkte.
- **Auto-Kilometerstand**: harte Grenze `mileageKm <= 70000`. Unter dieser Grenze zählt weniger km im Score zusätzlich als besser.

---

## 11. Frontend-Spec

Drei Ansichten (`/houses`, `/land`, `/cars`) plus Detail- und Vergleichsansicht. Grundstücke sind der
wichtigste erste Anwendungsfall: neueste und beste Treffer sofort sichtbar, mit fertigem Gesamt-Score.

### Dashboard (Liste) je Ansicht
- Umschaltbar Karten- und Tabellenansicht, Standard-Sortierung nach Score (höchster zuerst), dann nach "neu seit letztem Lauf".
- Karte zeigt erstes Bild, **Score groß und prominent** (nicht klein irgendwo am Rand), Preis (oder "Preis auf
  Anfrage" plus KI-Schätzung), Schlüsselzahlen, und darunter die 2-4 wichtigsten Pluspunkte/Minuspunkte aus `scoreBreakdown`.
  - Häuser: m² Wohnfläche, Zimmer, Baujahr, EUR/m², Garten/Pool-Icon.
  - Grundstücke: m², EUR/m², Zonierungs-Status (bestätigt/unklar), Ort.
  - Autos: km, Erstzulassung, PS, Getriebe, Kraftstoff, Marke, Entfernung von Ismaning, Finanzierungsrate/Monat.
- Badges: "neu seit letztem Lauf", "Preis gesenkt".
- Filter-Leiste und Sortierung (Score, Preis, EUR/m², km, Entfernung).
- Flag-Buttons je Karte: Favorit, raus, gesehen (gemeinsam für alle Nutzer, siehe Abschnitt 2).
  "Raus" ausblendbar.

### Detailansicht
- **Bildergalerie zum Durchklicken** (Karussell mit Vor/Zurück und Thumbnails).
- Score gross oben, volle `scoreBreakdown`-Liste darunter, Möglichkeit den Score manuell zu überschreiben
  (`scoreOverride`, siehe Abschnitt 9).
- Alle normalisierten Felder, Preisverlauf als kleine Grafik, Link zum Original.
- Häuser/Grundstücke: KI-Bildbewertung sichtbar (`aiImageNotes`).
- Autos: **Finanzierungs-Rechner direkt sichtbar** unter dem Preis (Abschnitt 5), Ausstattungs-Badges
  (Adaptiver Tempomat, Einparkkamera, Infotainment-Generation), Button "Recherche" (Versicherung, Facelift).

### Vergleichsansicht (`/compare`)
- Mehrere Inserate nebeneinander in einer Tabelle.
- Pro Kennzahl-Zeile den besten Wert hervorheben (niedrigster EUR/m², niedrigste km usw.).
- Abgeleitete Sinn-Metriken: Immo EUR pro m². Auto Preis im Verhältnis zu km, Alter und PS.
- Ziel: auf einen Blick sehen, was ein gutes Angebot ist und was nicht.

### Benachrichtigungen
- Push-Opt-in beim ersten Besuch (Browser-Berechtigung), pro Gerät.
- Auslöser: neue Treffer über den Hard-Filtern, Preissenkungen.

### Phase 2, noch nicht Teil der ersten Bauphase
- **Direktnachricht/E-Mail an den Verkäufer** aus der Detailansicht heraus, z. B. Preisanfrage bei
  "Preis auf Anfrage"-Inseraten. Sinnvoll, weil einige kroatische Grundstücks-Inserate keinen Preis nennen.
  Zurückgestellt, weil es je nach Portal unterschiedliche Kontaktwege gibt (Formular, E-Mail, Telefon)
  und zuerst der Kern der App stehen soll.

---

## 12. Env-Variablen (`.env.example`)

```
APIFY_TOKEN=
INGEST_SECRET=
DATABASE_URL=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_APP_URL=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

(Kein `APP_PASSWORD`, da bewusst ohne Login, siehe Abschnitt 2.)

---

## 13. Build-Reihenfolge (Meilensteine)

1. Repo, Next.js, Tailwind, shadcn/ui, Prisma, Neon/Supabase verbinden. Erstes Deploy auf Vercel, kein Login.
2. Prisma-Schema nach Abschnitt 4, Migration, leere DB.
3. Apify-Wrapper, Njuskalo manuell triggern (Grundstücke zuerst, da höchste Priorität), `/api/ingest`,
   Normalizer, echte Grundstücks-Daten in der DB.
4. Frontend Grundstücke: Dashboard mit Score-Anzeige und `scoreBreakdown`, Detail mit Bildkarussell und
   Score-Override. Danach Häuser (gleicher Flow, eigener Filter).
5. Fake-Preis-Erkennung und Zonierungs-Check (Abschnitt 9), noch ohne KI, erstmal regelbasiert testen.
6. Autos: AutoScout24 + mobile.de Normalizer, Auto-Ansicht, Entfernung-zu-Ismaning-Berechnung, Finanzierungs-Rechner.
7. Eigene Index-Oglasi- und AutoHero-Crawlee-Actors bauen, auf Apify deployen, verdrahten.
8. Dedupe, vollständiges Scoring inkl. Location-Score-Tabelle, Vergleichsansicht, Flags.
9. KI-Bildbewertung (günstiges Modell), KI-Fair-Preis-Schätzung, Auto-Recherche (Versicherung, Facelift).
10. Push-Benachrichtigungen (neue Treffer, Preissenkungen).
11. Scheduling und Webhooks scharf schalten (1x täglich für beide Bereiche), "neu seit letztem Lauf"-Badges.

Nach jedem Meilenstein lauffähig halten und committen.
