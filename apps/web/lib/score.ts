// lib/score.ts — EIN Gesamt-Score (0-100) je Inserat + VOLLSTÄNDIGE Begründung
// (SPEC §5). Gewichte in lib/config.ts. Der Breakdown enthält ALLE bewerteten
// Kriterien ({label, points, weight, pct}) plus die Kriterien, zu denen die
// Quelle keine Angabe liefert (points 0, "keine Angabe") — so ist sichtbar,
// wie sich der Score zusammensetzt und was mangels Daten neutral blieb.
// Score = gewichteter Schnitt der bewerteten Kriterien, normiert auf 0-100.
import { WEIGHTS, HOUSE, LAND, CAR, getLocationScore } from "./config";
import type { NormalizedListing, ScoreReason, Vertical } from "./normalize/types";

export type Scorable = Partial<NormalizedListing> & {
  vertical: Vertical;
  priceEur: number;
  aiImageScore?: number | null;
};

export interface ScoreResult {
  score: number; // 0-100
  breakdown: ScoreReason[]; // alle Kriterien (bewertet + "keine Angabe")
  locationScore: number | null; // 1-10, wird mitgespeichert (Haus/Grundstück)
}

/** Ein bewertetes Kriterium: Gewicht, Erfüllungsgrad 0..1, Anzeige-Label. */
interface Part {
  w: number;
  v: number;
  label: string;
}

/** Sammler: bewertete Kriterien + fehlende Angaben. */
class Parts {
  parts: Part[] = [];
  missing: string[] = [];
  add(w: number, v: number, label: string) {
    this.parts.push({ w, v, label });
  }
  /** Kriterium, zu dem die Quelle nichts liefert — zählt neutral, wird aber ausgewiesen. */
  miss(label: string) {
    this.missing.push(label);
  }
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Niedriger Wert = besser, linear über ein Band [good, bad] -> 1..0. */
function lowerIsBetter(value: number, good: number, bad: number): number {
  if (bad === good) return 0.5;
  return clamp01((bad - value) / (bad - good));
}

function has(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/** Gewichteter Schnitt der bewerteten Kriterien -> 0..100. */
function totalScore(parts: Part[]): number {
  const wSum = parts.reduce((s, p) => s + p.w, 0);
  if (wSum === 0) return 0;
  return Math.round((parts.reduce((s, p) => s + p.w * p.v, 0) / wSum) * 100);
}

/**
 * Vollständiger Breakdown: pro Kriterium signierte Punkte relativ zu "neutral"
 * (v=0.5), plus Gewicht und Erfüllungsgrad in Prozent. Sortiert nach |points|.
 * Danach die "keine Angabe"-Kriterien (points 0).
 */
function toBreakdown(p: Parts): ScoreReason[] {
  const rated = p.parts
    .map((x) => ({
      label: x.label,
      points: Math.round((x.v - 0.5) * 2 * x.w),
      weight: x.w,
      pct: Math.round(x.v * 100),
    }))
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const missing = p.missing.map((label) => ({
    label: `${label}: keine Angabe`,
    points: 0,
  }));
  return [...rated, ...missing];
}

function qualify(v: number, goodText: string, okText: string, badText: string): string {
  return v >= 0.7 ? goodText : v >= 0.4 ? okText : badText;
}

// ---------------------------------------------------------------- Häuser
function scoreHouse(l: Scorable): { p: Parts; loc: number | null } {
  const w = WEIGHTS.house;
  const p = new Parts();
  const price = l.displayPriceEur ?? l.priceEur;

  const ppm = l.pricePerLivingM2 ?? (has(l.areaLivingM2) && l.areaLivingM2 > 0 ? price / l.areaLivingM2 : null);
  if (has(ppm)) {
    const v = lowerIsBetter(ppm, HOUSE.pricePerLivingM2Band.good, HOUSE.pricePerLivingM2Band.bad);
    p.add(w.pricePerM2, v, `Preis/Wohn-m² ${Math.round(ppm)} € (${qualify(v, "sehr gut", "im Rahmen", "hoch")})`);
  } else p.miss("Preis pro Wohn-m²");

  const ppp = l.pricePerPlotM2 ?? (has(l.areaPlotM2) && l.areaPlotM2 > 0 ? price / l.areaPlotM2 : null);
  if (has(ppp)) {
    const v = lowerIsBetter(ppp, HOUSE.pricePerPlotM2Band.good, HOUSE.pricePerPlotM2Band.bad);
    p.add(w.pricePerPlotM2, v, `Preis/Grundstücks-m² ${Math.round(ppp)} € (${qualify(v, "sehr gut", "im Rahmen", "hoch")})`);
  } else p.miss("Preis pro Grundstücks-m²");

  const loc = getLocationScore(l.locationRaw ?? null);
  if (loc) p.add(w.locationScore, (loc.score - 1) / 9, `Ort ${loc.place} (${loc.score}/10)`);
  else p.miss("Location-Score (Ort nicht in Tabelle)");

  if (has(l.areaLivingM2)) {
    const inSpot = l.areaLivingM2 >= HOUSE.sweetSpot.livingM2Min && l.areaLivingM2 <= HOUSE.sweetSpot.livingM2Max;
    p.add(
      w.livingSize,
      inSpot ? 1 : 0.5, // über dem Sweet Spot neutral (kein Abzug, kein Bonus)
      inSpot
        ? `${Math.round(l.areaLivingM2)} m² Wohnfläche im Sweet Spot 80-140`
        : `${Math.round(l.areaLivingM2)} m² Wohnfläche (über Sweet Spot, neutral)`,
    );
  } else p.miss("Wohnfläche");

  if (has(l.areaPlotM2) && l.areaPlotM2 > 0) {
    const a = l.areaPlotM2;
    const v =
      a >= HOUSE.sweetSpot.plotM2Min && a <= HOUSE.sweetSpot.plotM2Max
        ? 1
        : a > HOUSE.sweetSpot.plotM2Max
          ? 0.75
          : a >= 150
            ? 0.5
            : 0.25;
    p.add(
      w.plotSize,
      v,
      v === 1 ? `Grundstück ${Math.round(a)} m² im Sweet Spot 300-400` : `Grundstück ${Math.round(a)} m²`,
    );
  } else p.miss("Grundstücksfläche");

  if (has(l.rooms)) {
    const ideal = l.rooms >= HOUSE.sweetSpot.roomsIdeal;
    p.add(w.rooms, ideal ? 1 : 0.4, ideal ? `${l.rooms} Zimmer (Ideal erreicht)` : `${l.rooms} Zimmer (Minimum)`);
  } else p.miss("Zimmerzahl");

  if (has(l.bathroomCount) && l.bathroomCount >= 1) {
    const v = l.bathroomCount >= HOUSE.sweetSpot.bathroomsIdeal ? 1 : 0.6;
    p.add(w.bathroom, v, `${l.bathroomCount} Bad/Bäder`);
  } else p.miss("Bäder");

  if (l.hasGarden != null) p.add(w.garden, l.hasGarden ? 1 : 0.2, l.hasGarden ? "Garten vorhanden" : "Kein Garten");
  else p.miss("Garten");
  if (l.hasParkingSpot === true) p.add(w.parking, 1, "Stellplatz vorhanden");
  else p.miss("Stellplatz");
  if (l.hasGarage === true) p.add(w.garage, 1, "Garage vorhanden");
  else p.miss("Garage");
  if (l.hasPool === true) p.add(w.pool, 1, "Pool vorhanden");
  else p.miss("Pool");
  if (l.hasAuxiliaryBuilding === true) p.add(w.auxBuilding, 1, "Nebengebäude (z. B. Sommerküche)");
  else p.miss("Nebengebäude");
  if (l.hasAirConditioning === true) p.add(w.airConditioning, 1, "Klimaanlage");
  else p.miss("Klimaanlage");

  const modernYear = Math.max(l.yearBuilt ?? 0, l.yearRenovated ?? 0);
  if (modernYear > 0) {
    const t = HOUSE.modernTiers;
    const v = modernYear >= t.max ? 1 : modernYear >= t.better ? 0.8 : modernYear >= t.base ? 0.6 : modernYear >= 2010 ? 0.35 : 0.1;
    p.add(w.modern, v, `${l.yearRenovated && l.yearRenovated >= (l.yearBuilt ?? 0) ? "Renoviert" : "Baujahr"} ${modernYear}`);
  } else p.miss("Baujahr/Renovierung");

  if (l.renovationNeeded != null) {
    const map = { none: 1, light: 0.8, moderate: 0.4, heavy: 0 } as const;
    const txt = { none: "Kein Renovierungsbedarf", light: "Leichter Renovierungsbedarf", moderate: "Mittlerer Renovierungsbedarf", heavy: "Starker Renovierungsbedarf" } as const;
    p.add(w.renovation, map[l.renovationNeeded], txt[l.renovationNeeded]);
  } else p.miss("Renovierungsbedarf (KI-Bild)");

  if (l.hasSeaViewLikely === true) p.add(w.seaView, 1, "Meerblick wahrscheinlich");
  if (l.looksLikeTouristRental === true) p.add(w.touristPenalty, 0, "Wirkt wie Ferienvermietungs-Objekt");

  if (has(l.aiImageScore)) p.add(w.aiImage, clamp01(l.aiImageScore / 100), `KI-Bildeindruck ${l.aiImageScore}/100`);
  else p.miss("KI-Bildbewertung");

  return { p, loc: loc?.score ?? null };
}

// ---------------------------------------------------------------- Grundstücke
function scoreLand(l: Scorable): { p: Parts; loc: number | null } {
  const w = WEIGHTS.land;
  const p = new Parts();
  const price = l.displayPriceEur ?? l.priceEur;

  const ppm = l.pricePerM2 ?? (has(l.areaPlotM2) && l.areaPlotM2 > 0 ? price / l.areaPlotM2 : null);
  if (has(ppm)) {
    const v = lowerIsBetter(ppm, LAND.pricePerM2Band.good, LAND.pricePerM2Band.bad);
    p.add(w.pricePerM2, v, `Preis/m² ${Math.round(ppm)} € (${qualify(v, "sehr gut", "im Rahmen", "hoch")})`);
  } else p.miss("Preis pro m²");

  const loc = getLocationScore(l.locationRaw ?? null);
  if (loc) p.add(w.locationScore, (loc.score - 1) / 9, `Ort ${loc.place} (${loc.score}/10)`);
  else p.miss("Location-Score (Ort nicht in Tabelle)");

  if (has(l.areaPlotM2) && l.areaPlotM2 > 0) {
    const a = l.areaPlotM2;
    const s = LAND.sweetSpot;
    const v =
      a >= s.idealMin && a <= s.idealMax
        ? 1
        : a > s.idealMax
          ? 0.75
          : a >= s.plotM2Min
            ? 0.5 + (0.5 * (a - s.plotM2Min)) / (s.idealMin - s.plotM2Min)
            : 0.2;
    p.add(
      w.plotSize,
      v,
      a >= s.idealMin && a <= s.idealMax
        ? `${Math.round(a)} m², passt zum Sweet Spot 700-800`
        : `${Math.round(a)} m² Fläche`,
    );
  } else p.miss("Fläche");

  if (has(l.aiImageScore)) p.add(w.aiImage, clamp01(l.aiImageScore / 100), `KI-Bildeindruck ${l.aiImageScore}/100`);
  else p.miss("KI-Bildbewertung");

  if (l.zoningConfirmedBuildingLand === true) p.add(w.zoningUnclear, 1, "Baugrund bestätigt");
  else if (l.zoningStated === false || l.zoningStated == null)
    p.add(w.zoningUnclear, 0, "Zonierung unklar, bitte selbst prüfen");

  return { p, loc: loc?.score ?? null };
}

// ---------------------------------------------------------------- Autos
/** Unfall/Schäden aus der Beschreibung erkennen (SPEC §5, leichter Minuspunkt). */
function detectAccidentMention(text: string): boolean {
  return /unfall|hagelschaden|besch[äa]digt|kratzer|delle|lackschaden|reparaturbedarf|accident|damaged/i.test(
    text,
  );
}

function scoreCar(l: Scorable): { p: Parts; loc: number | null } {
  const w = WEIGHTS.car;
  const p = new Parts();
  const price = l.displayPriceEur ?? l.priceEur;

  if (l.hasAdaptiveCruiseControl === true) p.add(w.adaptiveCruise, 1, "Adaptiver Tempomat (ACC)");
  else p.miss("Adaptiver Tempomat (nicht in Ausstattung gefunden)");
  if (l.hasParkingCamera === true) p.add(w.parkingCamera, 1, "Einparkhilfe mit Kamera");
  else p.miss("Einparkkamera (nicht in Ausstattung gefunden)");

  if (l.infotainmentGeneration != null && l.infotainmentGeneration !== "unknown") {
    const map = { latest: 1, previous: 0.35, older: 0 } as const;
    const txt = {
      latest: "Neuestes Infotainment-System",
      previous: "Infotainment der Vorgänger-Generation",
      older: "Älteres Infotainment-System",
    } as const;
    p.add(w.infotainmentLatest, map[l.infotainmentGeneration], txt[l.infotainmentGeneration]);
  } else p.miss("Infotainment-Generation (KI-Recherche)");

  if (l.description && detectAccidentMention(l.description)) {
    p.add(w.accidentPenalty, 0, "Unfall/Schäden in Beschreibung erwähnt");
  }

  if (l.make) {
    const preferred = CAR.soft.preferredMakes.map((m) => m.toLowerCase());
    const isPref = preferred.some((m) => l.make!.toLowerCase().includes(m));
    p.add(w.preferredMake, isPref ? 1 : 0.4, isPref ? `${l.make} (bevorzugte Marke)` : `Marke ${l.make}`);
  } else p.miss("Marke");

  if (l.bodyType != null) {
    const map = { limousine: 1, suv_coupe: 0.8, kombi: 0.5, other: 0.5, suv: 0.25, sportback: 0.15 } as const;
    const txt = {
      limousine: "Limousine (Wunsch-Karosserie)",
      suv_coupe: "Coupé-SUV (abfallendes Heck)",
      kombi: "Kombi",
      other: "Karosserie neutral",
      suv: "Kastenförmiges SUV",
      sportback: "Sportback/Fließheck (unerwünscht)",
    } as const;
    p.add(w.bodyStyle, map[l.bodyType], txt[l.bodyType]);
  } else p.miss("Karosserieform");

  if (has(l.powerPs)) {
    const v = l.powerPs >= CAR.soft.bonusPowerPs ? 1 : clamp01((l.powerPs - CAR.hard.powerPsMin) / (CAR.soft.bonusPowerPs - CAR.hard.powerPsMin)) * 0.6;
    p.add(w.powerBonus, v, l.powerPs >= CAR.soft.bonusPowerPs ? `${l.powerPs} PS (>= 150)` : `${l.powerPs} PS`);
  } else p.miss("Leistung");

  if (has(l.mileageKm)) {
    const v = lowerIsBetter(l.mileageKm, 0, CAR.hard.mileageKmMax);
    p.add(w.lowMileage, v, `${Math.round(l.mileageKm / 1000)} tkm (${qualify(v, "sehr wenig", "ok", "viel")})`);
  } else p.miss("Kilometerstand");

  if (has(l.firstRegistrationYear)) {
    const v = clamp01((l.firstRegistrationYear - CAR.hard.firstRegistrationYearMin) / 3);
    p.add(w.newerYear, v, `Erstzulassung ${l.firstRegistrationYear}`);
  } else p.miss("Erstzulassung");

  {
    const v = lowerIsBetter(price, CAR.hard.priceMin, CAR.hard.priceMax);
    p.add(w.lowerPrice, v, `Preis ${Math.round(price / 1000)}k € im Band (${qualify(v, "günstig", "mittig", "oben")})`);
  }

  return { p, loc: null };
}

/**
 * Berechnet Gesamt-Score (0-100), vollständigen Breakdown und Location-Score.
 * Anzeige-Logik: `scoreOverride ?? score` (SPEC §9).
 */
export function computeScore(l: Scorable): ScoreResult {
  const { p, loc } =
    l.vertical === "house" ? scoreHouse(l) : l.vertical === "land" ? scoreLand(l) : scoreCar(l);
  return { score: totalScore(p.parts), breakdown: toBreakdown(p), locationScore: loc };
}
