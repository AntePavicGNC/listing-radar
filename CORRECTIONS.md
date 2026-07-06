# Listing Radar, Korrektur-Anweisung für Claude Code

Diese Datei beschreibt den **Umbau** des bestehenden Repos vom aktuellen Ist-Zustand auf die neue,
finale Spezifikation. Es ist **kein Neuanfang**. Das vorhandene Fundament bleibt erhalten.

## Quelle der Wahrheit

- Die Datei `SPEC.md` im Repo wurde durch die **neue, finale Version** ersetzt. Ebenfalls neu im Repo:
  `ORTE_LOCATION_SCORE.md` (die Ortstabelle 1 bis 10).
- Bei jedem Widerspruch zwischen bestehendem Code und `SPEC.md` gilt **`SPEC.md`**.
- Der Code im Repo wurde auf einer **veralteten** Spec gebaut (nur bis Meilenstein 4, Häuser-Dashboard).
  Deshalb weicht vieles ab. Diese Datei listet die Abweichungen konkret auf.

## Grundregeln für den Umbau

- Behalten und weiterverwenden: Next.js-16-Setup, Prisma + Supabase, das redaktionelle Theme (Fraunces),
  die Karten-Optik, das Ingest-Grundgerüst, den Njuškalo-Normalizer-Ansatz.
- **Wichtig, Next.js 16**: vor dem Schreiben von Code die Hinweise in `apps/web/AGENTS.md` beachten und die
  Guides unter `node_modules/next/dist/docs/` lesen. Middleware heißt hier `proxy.ts`. Nicht auf altes
  Next.js-Wissen verlassen.
- Nach **jeder Phase** muss die App bauen und laufen (`npm run build`, `npm run dev`), dann committen.
- Umbauen statt wegwerfen. Bestehende Dateien anpassen, nicht parallel neue Dubletten anlegen.

---

## Phase 1, Login/Passwort komplett entfernen

Neue Entscheidung: **kein Login, kein Passwort**. Die App läuft auf einer nicht öffentlich beworbenen
Vercel-URL, Zugriff per Link, gedacht für Ante, seinen Vater und ein bis zwei weitere Personen.

Entfernen:
- `apps/web/proxy.ts` (der Passwort-Proxy). Ganz löschen, keine Auth-Middleware.
- `apps/web/lib/auth.ts`
- `apps/web/app/login/` (ganzer Ordner)
- `apps/web/app/api/login/` (ganzer Ordner)
- `APP_PASSWORD` aus `.env.example` und aus jeder Verwendung im Code.

Danach muss die App ohne Weiterleitung auf `/login` direkt laden. Commit.

---

## Phase 2, Datenmodell erweitern (`prisma/schema.prisma` + `lib/normalize/types.ts`)

Beide Dateien parallel anpassen, damit sie deckungsgleich sind. Dann Migration erzeugen.

### Enums
- `Source`: Wert **`autohero`** ergänzen.
- `Fuel`: `hybrid` aufsplitten in **`hybrid_petrol`** und **`hybrid_diesel`**. Ergebnis:
  `diesel, petrol, hybrid_petrol, hybrid_diesel, electric, other`.
- Neuer Enum `RenovationNeeded`: `none, light, moderate, heavy`.
- Neuer Enum `InfotainmentGeneration`: `latest, previous, older, unknown`.
- Neuer Enum `BodyType`: `limousine, sportback, suv, suv_coupe, kombi, other` (bisher war `bodyType` ein String).

### Neue gemeinsame Felder (Listing)
- `displayPriceEur Int?` (echter Preis nach Fake-Preis-Erkennung, siehe Phase 7)
- `priceOnRequest Boolean @default(false)`
- `scoreBreakdown Json?` (Liste aus { label, points }, für die Plus/Minus-Anzeige)
- `scoreOverride Int?` und `scoreOverrideNote String?` (manuell gesetzter Score, übersteht Re-Scrapes)
- `aiFairPriceEstimate Int?` (nur bei `priceOnRequest`)
- `locationScore Int?` (1 bis 10, aus der Ortstabelle, für Haus und Grundstück)

### Neue Haus-Felder
- `bathroomCount Int?`, `hasPool Boolean?`, `hasParkingSpot Boolean?`, `hasGarage Boolean?`,
  `hasAirConditioning Boolean?`, `hasAuxiliaryBuilding Boolean?`, `heatingType String?`,
  `renovationNeeded RenovationNeeded?`, `hasSeaViewLikely Boolean?`, `looksLikeTouristRental Boolean?`,
  `pricePerPlotM2 Float?`

### Grundstück-Felder ändern
- Feld `zoning String?` **ersetzen** durch `zoningStated Boolean?` und `zoningConfirmedBuildingLand Boolean?`
  (siehe neue Grundstücks-Hard-Filter-Logik unten).

### Neue Auto-Felder
- `rangeKm Int?`, `hasAdaptiveCruiseControl Boolean?`, `hasParkingCamera Boolean?`,
  `infotainmentGeneration InfotainmentGeneration?`, `monthlyFinancingEur Int?`
- `bodyType` von String auf den neuen Enum `BodyType` umstellen.

Danach: Prisma-Migration erzeugen, `prisma generate`, Build prüfen. Commit.

---

## Phase 3, Filter, Scoring und Config auf die neuen Regeln (`lib/config.ts`, `lib/filters.ts`, `lib/score.ts`)

### `lib/config.ts`, Werte korrigieren
Autos (`CAR.hard`):
- `priceMin` **18000** (war 20000), `priceMax` 30000
- `firstRegistrationYearMin` **2023** (war 2022)
- `powerPsMin` **110** (war 130)
- `mileageKmMax` 70000, `transmission` automatic, `distanceFromIsmaningKmMax` 200 (bleiben)
- **Neu, Kraftstoff wird Hard-Filter**: erlaubte Liste `["diesel","hybrid_petrol","hybrid_diesel","electric"]`.
  Bei `electric` zusätzlich `rangeKm >= 500`. Reiner Benziner fliegt raus.

Autos (Soft):
- `preferredMakes` auf **`["Audi","BMW","Mercedes"]`** reduzieren (Cupra/VW raus aus der Bevorzugung, aber
  alle Marken bleiben grundsätzlich erlaubt, kein Ausschluss).
- `preferredBodyType` = `limousine`. Zusätzlich: `sportback` ist unerwünscht (Minuspunkt), `suv` nur gut, wenn
  `suv_coupe` (abfallendes Heck). Klassisches kastenförmiges `suv` gibt Minuspunkte.
- `bonusPowerPs` = 150 (ab hier Zusatzpunkte, Wunsch-Referenz ist der aktuelle Wagen mit 150 PS).

Häuser (`HOUSE`):
- `hard`: `priceMin` 100000, `priceMax` 400000, `areaLivingM2Min` 80, **`roomsMin` 3 als Hard-Filter** (neu).
- Sweetspots: `areaLivingM2` 80 bis 140, `areaPlotM2` 300 bis 400, `roomsIdeal` 4.
- Modern-Stufen: 2020 (Basis), 2022 (mehr), 2024 (Maximum), gestuft statt binär.

Grundstücke (`LAND`):
- `hard`: `priceMin` 10000, `priceMax` 110000, `pricePerM2Max` 100 (eine der beiden Preisbedingungen reicht).
- Zonierung nicht mehr über simples `zoningContains`, sondern über `zoningConfirmedBuildingLand`/`zoningStated`
  (siehe Filter unten).

Ortstabelle:
- Neue Konstante `LOCATION_SCORES`, eine Map Ort (normalisiert) -> 1..10, exakt aus `ORTE_LOCATION_SCORE.md`.
- `ALLOWED_PLACES` bleibt die Allowlist. Der Location-Score kommt aus `LOCATION_SCORES`.

Gewichte (`WEIGHTS`):
- `house` und `land` um **`locationScore`** erweitern.
- `house` um `bathroom, parking, garage, pool, auxBuilding, airConditioning, seaView, touristPenalty,
  renovation, plotSize, livingSize` erweitern.
- `car` um `adaptiveCruise` (hohes Gewicht), `parkingCamera`, `infotainmentLatest` (hohes Gewicht),
  `accidentPenalty` (moderat), `powerBonus` erweitern. `preferredMake` bleibt leichtes Gewicht.

`SUGGESTED_ACTORS`: `autohero` und `indexoglasi` als "eigener Crawlee-Actor" vermerken (kein fertiger Actor).

### `lib/filters.ts`, Hard-Filter anpassen
- Haus: zusätzlich `rooms >= 3` als Hard-Filter.
- Grundstück: **raus nur, wenn eindeutig kein Baugrund** (`zoningStated === true && zoningConfirmedBuildingLand === false`).
  Wenn gar keine Zonierung angegeben ist (`zoningStated === false`), NICHT rausfiltern, sondern behalten und im
  Score leicht abwerten plus Hinweis "Zonierung unklar".
- Auto: neue Schwellen aus `config` (18000 / 2023 / 110) plus **Kraftstoff-Hard-Filter** und `rangeKm >= 500`
  bei Elektro.

### `lib/score.ts`, kompletter Umbau auf Gesamt-Score mit Begründung
- Rückgabe ändern von `number` auf `{ score: number; breakdown: { label: string; points: number }[] }`.
- Der Score ist EIN Gesamtwert 0 bis 100, der ALLES zusammenfasst (Preis, Lage, Ausstattung, KI-Bild).
  Kein separater Location-Score in der Anzeige, er fließt in den Gesamtwert ein.
- `breakdown` enthält die wichtigsten 3 bis 5 Gründe, positiv und negativ (für die Karten- und Detailanzeige).
- Haus: alle neuen Soft-Kriterien aus `config` berücksichtigen (Bäder, Garten, Stellplatz, Garage, Pool,
  Nebengebäude, Klima, gestuftes Baujahr, Renovierungsbedarf, Meerblick, Touristenvilla-Minus, Flächen-Sweetspots,
  Preis pro Wohn- UND Grundstücks-m², Location-Score).
- Grundstück: Preis pro m², Location-Score, Größe nahe Sweetspot, KI-Bild, Zonierung-unklar-Minus.
- Auto: ACC (stark), Einparkkamera, Infotainment "latest" (stark), Unfall/Kratzer (leichter Minus),
  Marke leicht bevorzugt, Limousine-Logik (Sportback minus, SUV nur als suv_coupe gut), niedrige km,
  neueres Jahr, niedrigerer Preis, PS >= 150 Bonus.
- **Score-Override**: die Anzeige nutzt `scoreOverride`, falls gesetzt, sonst den berechneten `score`.

### Häuser-Karte anpassen (`components/house-card.tsx`)
- Unter dem Score die 2 bis 4 wichtigsten Plus/Minus aus `scoreBreakdown` anzeigen.
- Neue Icons/Badges wo sinnvoll (Klima, Stellplatz, Pool).

Nach dieser Phase: Häuser-Ansicht zeigt den neuen Gesamt-Score mit Begründung. Commit.

---

## Phase 4, Grundstücke-Ansicht (höchste Priorität)

- Neue Route `apps/web/app/land/page.tsx`, analog zur Häuser-Ansicht, aber mit Grundstücks-Feldern
  (m², Preis pro m², Zonierungs-Status, Ort, Location-Score im Gesamt-Score).
- Eigene `land-card.tsx`.
- Grundstücke sind der wichtigste erste Anwendungsfall, deshalb hier vor Autos.

Commit.

---

## Phase 5, Autos-Ansicht + Entfernung + Finanzierungsrechner

- Neue Route `apps/web/app/cars/page.tsx` und `car-card.tsx`.
- `lib/geo.ts` nutzen/erweitern für `distanceFromIsmaningKm` (Luftlinie reicht für v1, Ismaning 48.2236, 11.6717).
- **Finanzierungsrechner** je Auto (SPEC §5): `ownFundsEur` (Default 18500), `maxLoanEur` (12000),
  `loanTermMonths` (48), Zinssatz Default **7 %** effektiv (Richtwert Juli 2026, in `config.ts`, mit
  Hinweis "bonitätsabhängig"). Anzeige der Monatsrate direkt unter dem Preis.

Commit.

---

## Phase 6, Detailseite + Vergleich + Flags

- Detailseite je Inserat: Bildergalerie zum Durchklicken (Karussell mit Vor/Zurück + Thumbnails),
  Score gross oben, volle `scoreBreakdown`-Liste, Feld zum Setzen von `scoreOverride`.
  Bei Autos zusätzlich Finanzierungsrechner sichtbar und Ausstattungs-Badges (ACC, Kamera, Infotainment).
- Vergleichsansicht `apps/web/app/compare/page.tsx`: mehrere Inserate nebeneinander, bester Wert je Zeile
  hervorgehoben, abgeleitete Sinn-Metriken.
- Flags (Favorit/raus/gesehen) sind im Schema schon da (`UserFlag`), sie gelten **gemeinsam** für alle Nutzer.
  UI-Buttons auf Karte und Detailseite ergänzen, "raus" ausblendbar.

Commit.

---

## Phase 7, Fake-Preis-Erkennung, Zonierungs-Check, dann KI-Anreicherung

Zuerst **regelbasiert** (ohne KI), dann KI ergänzen. Ablauf in `lib/ingest.ts` bzw. neuer `app/api/enrich`.

- Fake-Preis: unplausibel niedriger Preis (z. B. unter 1000 bei Haus/Grundstück) -> Titel/Beschreibung nach
  echtem Preis durchsuchen (Regex, dann kleines KI-Modell). Gefundener Preis wird `displayPriceEur`.
  Sonst "Preis auf Anfrage" erkennen (z. B. "cijena na upit") -> `priceOnRequest = true`, prominent anzeigen,
  plus KI-Fair-Preis-Schätzung `aiFairPriceEstimate`. Alle Preis-Filter/Scores rechnen ab hier mit `displayPriceEur`.
- Zonierungs-Check Grundstücke: Beschreibung prüfen, ob Portal-Kategorie stimmt. Eindeutig kein Baugrund -> raus.
  Nichts angegeben -> behalten, Score-Minus, Hinweis.
- KI-Bildbewertung (Haus/Grundstück): günstiges Vision-Modell (Anthropic SDK, `ANTHROPIC_API_KEY`), Zustand,
  Modernität, bei Haus zusätzlich `hasSeaViewLikely`, `looksLikeTouristRental`, `renovationNeeded`. Nur Inserate
  über den Hard-Filtern, nur erste ~5 Bilder. Ergebnis in `aiImageScore` + `aiImageNotes`, fließt in den Score.
- Auto-Recherche (on demand, Button): Versicherungs-Schätzung (Profil: 26 J., 9 J. Führerschein, angestellt,
  Tiefgarage, ADAC, SF 3, Ismaning), Modell-Alter/Facelift, Einschätzung günstig/normal/teuer. Ergebnis cachen.
- Infotainment-Bewertung (Auto): Innenraum-Fotos ans Vision-Modell, Abgleich mit recherchiertem Facelift-Zeitpunkt,
  Ergebnis in `infotainmentGeneration`. "latest" gibt starke Pluspunkte.
- Kostenrahmen insgesamt 5 bis 10 Euro/Monat, deshalb überall das günstigste ausreichende Modell.

Commit nach jedem Teilschritt.

---

## Phase 8, Eigene Actors (`actors/index-oglasi`, `actors/autohero`)

- Index Oglasi (Haus + Grundstück) und AutoHero (Auto) als eigene Crawlee-Actors (TypeScript), Output im
  gleichen Feld-Stil wie die fertigen Actors, Deploy via `apify push`, gleicher Webhook-Flow an `/api/ingest`.
- AutoHero ist technisch einfacher (feste Händler-Inventarliste, keine wechselnden Privatinserate).

Commit.

---

## Phase 9, Push-Benachrichtigungen

- Web Push (Service Worker + VAPID). `.env.example`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` ergänzen
  (und, falls noch nicht geschehen, `APP_PASSWORD` entfernen).
- Auslöser: neues Inserat über den Hard-Filtern, Preissenkung bei bereits gesehenen Inseraten.
- Direkt nach erfolgreichem `/api/ingest` auslösen.

Commit.

---

## Kurz-Checkliste der wichtigsten Abweichungen (Ist -> Soll)

- Login vorhanden -> **Login komplett entfernen**.
- Auto: 20000 / 2022 / 130 PS / Diesel nur soft -> **18000 / 2023 / 110 PS / Kraftstoff als Hard-Filter**.
- Score nur eine Zahl -> **Gesamt-Score + Plus/Minus-Begründung + manueller Override**.
- Kein Location-Score -> **Ortstabelle 1 bis 10 aus `ORTE_LOCATION_SCORE.md` einbauen**.
- Datenmodell schlank -> **viele neue Felder** (Bäder, Klima, Stellplatz, Pool, Renovierung, Meerblick,
  Touristenvilla, ACC, Kamera, Infotainment, Finanzierung, Fake-Preis-Felder, AutoHero).
- Nur Häuser-Ansicht -> **Grundstücke, Autos, Detailseite, Vergleich** ergänzen.
- Keine KI -> **Fake-Preis, Bildbewertung, Auto-Recherche, Infotainment-Erkennung**.
- Nur fertige Actors gedacht -> **Index Oglasi + AutoHero als eigene Actors**.
