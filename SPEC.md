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

- **Njuskalo** (Häuser + Grundstücke): fertiger Apify-Actor.
- **AutoScout24** (Autos): fertiger Apify-Actor.
- **mobile.de** (Autos): fertiger Apify-Actor.
- **Index Oglasi** (Häuser + Grundstücke): kein fertiger Actor vorhanden, also **eigener Crawlee-Actor**,
  der ebenfalls auf Apify deployed wird. Dadurch bleibt der gesamte Datenfluss identisch.

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

Auth (rein privat): **Vercel Password Protection** (Projekt-Einstellungen) als einfachste Variante,
alternativ Middleware mit Passwort aus `APP_PASSWORD` und Cookie. Kein Multi-User nötig.

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
    index-oglasi/         # eigener Crawlee-Actor
  SPEC.md
  .env.example
```

Start mit `git init`, früh ein erstes Deploy auf Vercel (Hello World mit aktivem Passwortschutz).

---

## 4. Normalisiertes Datenmodell

Jede Quelle liefert andere Feldnamen, alles wird auf EIN Schema gemappt. Exakte Output-Felder jedes Actors
vor dem Mapping einmal real prüfen (Test-Run), Feldnamen können abweichen.

```ts
type Source = "njuskalo" | "indexoglasi" | "autoscout24" | "mobilede";
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
  score: number;           // 0-100
  aiImageScore?: number;    // 0-100, nur Häuser/Grundstücke
  aiImageNotes?: string;
  raw: unknown;
}

interface HouseFields {
  areaLivingM2?: number;
  areaPlotM2?: number;
  rooms?: number;
  yearBuilt?: number;
  yearRenovated?: number;
  hasGarden?: boolean;
  pricePerLivingM2?: number;   // abgeleitet
}

interface LandFields {
  areaPlotM2?: number;
  zoning?: string;             // erwartet: "gradevinsko" (Baugrund)
  pricePerM2?: number;         // abgeleitet
}

interface CarFields {
  make?: string;
  model?: string;
  variant?: string;
  firstRegistrationYear?: number;   // Erstzulassung
  firstRegistrationMonth?: number;
  mileageKm?: number;
  fuel?: "diesel" | "petrol" | "hybrid" | "electric" | "other";
  transmission?: "manual" | "automatic";
  powerPs?: number;
  bodyType?: string;                // z. B. "limousine"
  distanceFromIsmaningKm?: number;  // abgeleitet
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

### Häuser

Hard:
- Ort in Allowlist
- `priceEur` zwischen `100000` und `400000`
- `areaLivingM2 >= 80`

Soft (Score hoch = besser, aber kein Ausschluss):
- `rooms >= 4`
- `hasGarden === true`
- `yearBuilt >= 2020` ODER `yearRenovated >= 2020`
- niedriger `pricePerLivingM2`
- guter `aiImageScore` (siehe Abschnitt 9)

### Grundstücke

Hard:
- Ort in Allowlist
- Typ ist Baugrund (`zoning` enthält "gradevinsko")
- Preis-Bedingung erfüllt, eine von beiden reicht:
  - `priceEur` zwischen `10000` und `110000`, ODER
  - `pricePerM2 <= 100`

Soft:
- niedriger `pricePerM2`
- guter `aiImageScore`

### Autos

Hard:
- `priceEur` zwischen `20000` und `30000`
- `firstRegistrationYear >= 2022`
- `transmission === "automatic"`
- `powerPs >= 130`
- `mileageKm <= 70000`
- `distanceFromIsmaningKm <= 200` (Umkreis um Ismaning, PLZ 85737)

Soft (kein Ausschluss):
- `fuel === "diesel"` bevorzugt
- `make` in [Audi, BMW, Mercedes, Cupra, VW]
- `bodyType === "limousine"`
- niedrigere `mileageKm` (unter der harten Grenze von 70000 zählt weniger als besser)
- neueres Zulassungsjahr, niedrigerer Preis im Band

`score.ts`: gewichtete Summe der Soft-Kriterien je Vertical, normalisiert auf 0-100, Gewichte als benannte Konstanten.

---

## 6. Dedupe

Dasselbe Objekt taucht oft auf beiden Portalen auf. Für v1 nicht hart mergen, sondern als mögliches Duplikat markieren:
- Kandidaten-Key aus gerundetem Preis + Fläche (bzw. km) + Stadt.
- Optional perceptual hash des ersten Bildes (`sharp` + dHash), Schwellwert vergleichen.
- Im Frontend Duplikate gruppieren, nur das günstigste/vollständigste prominent zeigen.

---

## 7. Apify-Integration

### Empfohlene fertige Actors (Input-Schema und Output-Felder vor Einsatz real prüfen)

- Njuskalo: `logiover/njuskalo-hr-property-scraper` (parst Ort bis Mikro-Lage, Preis EUR, Fläche, Bilder),
  Alternative `memo23/njuskalo-scraper`. Deckt Häuser und Grundstücke ab.
- AutoScout24: `memo23/autoscout24-scraper` oder `solidcode/autoscout24-scraper`.
- mobile.de: `memo23/mobile-de-scraper` (Incremental/Monitoring-Mode, gut für tägliche Läufe).

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

## 8. Eigener Index-Oglasi-Actor (`actors/index-oglasi`)

- **Crawlee (TypeScript)**, HTTP-Crawler wenn möglich, sonst Playwright bei JS-Rendering.
- Input: Region Zadar-Orte, Kategorie Haus bzw. Baugrund, Preis-Bereich.
- Zwei Stufen: Suchergebnis-Seiten paginieren, dann Detailseiten.
- Output im gleichen Feld-Stil wie die anderen Quellen, damit der Normalizer minimal bleibt.
- Apify-Proxy, moderate Concurrency, höfliche Delays.
- Deploy via `apify push`, danach gleicher Schedule- und Webhook-Flow.

---

## 9. KI-Features

### Bildbewertung (Häuser + Grundstücke)
- In `api/enrich` die Bild-URLs eines Inserats an ein vision-fähiges Modell schicken (Anthropic SDK, server-side, `ANTHROPIC_API_KEY`).
- Modell bewertet Zustand, Modernität, sichtbare Renovierung, Licht/Lage-Eindruck, bei Grundstücken Lage/Zuschnitt.
- Rückgabe als `aiImageScore` (0-100) + kurze `aiImageNotes`.
- Kostenkontrolle: nur Inserate bewerten, die die Hard-Filter bestehen, und je Inserat nur die ersten N Bilder.
- `aiImageScore` fließt als Soft-Kriterium in `score.ts` ein.

### Auto-Recherche (on demand pro Inserat)
Button "Recherche" auf der Auto-Detailseite ruft `api/enrich` auf und liefert:
- **Versicherung, grobe Schätzung** für das Profil: 26 Jahre, 9 Jahre Fahrerlaubnis, angestellt, Tiefgarage,
  ADAC-Mitglied, SF 3, Wohnort Ismaning. Klar als unverbindliche Schätzung kennzeichnen, kein echtes Angebot.
- **Modell-Alter und Facelift**: aktuelle Generation, Alter des Modells, bekannter oder erwarteter nächster Facelift.
- Umsetzung: Anthropic SDK mit aktivierter Websuche, Ergebnis cachen (pro Modell/Variante), damit es nicht jedes Mal neu recherchiert.

---

## 10. Status der Filter

- Alle Filter sind final festgelegt, keine offenen Punkte.
- **Auto-Kilometerstand**: harte Grenze `mileageKm <= 70000`. Unter dieser Grenze zählt weniger km im Score zusätzlich als besser.

---

## 11. Frontend-Spec

Drei Ansichten (`/houses`, `/land`, `/cars`) plus Detail- und Vergleichsansicht.

### Dashboard (Liste) je Ansicht
- Umschaltbar Karten- und Tabellenansicht.
- Karte zeigt erstes Bild, Preis, Schlüsselzahlen und Score-Badge.
  - Häuser: m² Wohnfläche, Zimmer, Baujahr, EUR/m², Garten-Icon, KI-Bild-Score.
  - Grundstücke: m², EUR/m², Baugrund-Status, KI-Bild-Score.
  - Autos: km, Erstzulassung, PS, Getriebe, Kraftstoff, Marke, Entfernung von Ismaning.
- Badges: "neu seit letztem Lauf", "Preis gesenkt".
- Filter-Leiste und Sortierung (Score, Preis, EUR/m², km, Entfernung).
- Flag-Buttons je Karte: Favorit, raus, gesehen. "Raus" ausblendbar.

### Detailansicht
- **Bildergalerie zum Durchklicken** (Karussell mit Vor/Zurück und Thumbnails).
- Alle normalisierten Felder, Preisverlauf als kleine Grafik, Link zum Original.
- Häuser/Grundstücke: KI-Bewertung sichtbar. Autos: Button "Recherche" (Versicherung, Facelift).

### Vergleichsansicht (`/compare`)
- Mehrere Inserate nebeneinander in einer Tabelle.
- Pro Kennzahl-Zeile den besten Wert hervorheben (niedrigster EUR/m², niedrigste km usw.).
- Abgeleitete Sinn-Metriken: Immo EUR pro m². Auto Preis im Verhältnis zu km, Alter und PS.
- Ziel: auf einen Blick sehen, was ein gutes Angebot ist und was nicht.

---

## 12. Env-Variablen (`.env.example`)

```
APIFY_TOKEN=
INGEST_SECRET=
DATABASE_URL=
APP_PASSWORD=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_APP_URL=
```

---

## 13. Build-Reihenfolge (Meilensteine)

1. Repo, Next.js, Tailwind, shadcn/ui, Prisma, Neon/Supabase verbinden. Erstes Deploy auf Vercel mit Passwortschutz.
2. Prisma-Schema nach Abschnitt 4, Migration, leere DB.
3. Apify-Wrapper, Njuskalo manuell triggern, `/api/ingest`, Njuskalo-Normalizer, echte Häuser-Daten in der DB.
4. Frontend Häuser: Dashboard + Detail mit Bildkarussell. Danach Grundstücke (gleicher Flow, eigener Filter).
5. Autos: AutoScout24 + mobile.de Normalizer, Auto-Ansicht, Entfernung-zu-Ismaning-Berechnung.
6. Eigenen Index-Oglasi-Crawlee-Actor bauen, auf Apify deployen, verdrahten.
7. Dedupe, Scoring, Vergleichsansicht, Filter, Flags.
8. KI-Bildbewertung (Häuser/Grundstücke) und Auto-Recherche (Versicherung, Facelift).
9. Scheduling und Webhooks scharf schalten, "neu seit letztem Lauf" und Preis-Senkungs-Badges.

Nach jedem Meilenstein lauffähig halten und committen.
