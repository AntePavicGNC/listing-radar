// lib/score.ts — EIN Gesamt-Score (0-100) je Inserat + Plus-/Minus-Begründung
// (SPEC §5). Gewichte in lib/config.ts. Fehlende Kriterien zählen neutral (werden
// aus der gewichteten Summe ausgelassen); einseitige Kriterien (Pool, ACC, Unfall …)
// zählen nur, wenn die Information vorliegt.
import { WEIGHTS, HOUSE, LAND, CAR, getLocationScore } from "./config";
import type { NormalizedListing, ScoreReason, Vertical } from "./normalize/types";

export type Scorable = Partial<NormalizedListing> & {
  vertical: Vertical;
  priceEur: number;
  aiImageScore?: number | null;
};

export interface ScoreResult {
  score: number; // 0-100
  breakdown: ScoreReason[]; // wichtigste 3-5 Gründe, positiv und negativ
  locationScore: number | null; // 1-10, wird mitgespeichert (Haus/Grundstück)
}

/** Ein Kriterium: Gewicht, Erfüllungsgrad 0..1, Anzeige-Label. */
interface Part {
  w: number;
  v: number;
  label: string;
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

/** Gewichteter Schnitt der vorhandenen Kriterien -> 0..100. */
function totalScore(parts: Part[]): number {
  const wSum = parts.reduce((s, p) => s + p.w, 0);
  if (wSum === 0) return 0;
  return Math.round((parts.reduce((s, p) => s + p.w * p.v, 0) / wSum) * 100);
}

/**
 * Breakdown: pro Kriterium signierte Punkte relativ zu "neutral" (v=0.5),
 * die wichtigsten (bis zu 5, mind. |1| Punkt) nach Betrag sortiert.
 */
function toBreakdown(parts: Part[], max = 5): ScoreReason[] {
  return parts
    .map((p) => ({ label: p.label, points: Math.round((p.v - 0.5) * 2 * p.w) }))
    .filter((r) => Math.abs(r.points) >= 1)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, max);
}

function qualify(v: number, goodText: string, okText: string, badText: string): string {
  return v >= 0.7 ? goodText : v >= 0.4 ? okText : badText;
}

// ---------------------------------------------------------------- Häuser
function scoreHouse(l: Scorable): { parts: Part[]; loc: number | null } {
  const w = WEIGHTS.house;
  const parts: Part[] = [];
  const price = l.displayPriceEur ?? l.priceEur;

  const ppm = l.pricePerLivingM2 ?? (has(l.areaLivingM2) && l.areaLivingM2 > 0 ? price / l.areaLivingM2 : null);
  if (has(ppm)) {
    const v = lowerIsBetter(ppm, HOUSE.pricePerLivingM2Band.good, HOUSE.pricePerLivingM2Band.bad);
    parts.push({
      w: w.pricePerM2,
      v,
      label: `Preis/Wohn-m² ${Math.round(ppm)} € (${qualify(v, "sehr gut", "im Rahmen", "hoch")})`,
    });
  }
  const ppp = l.pricePerPlotM2 ?? (has(l.areaPlotM2) && l.areaPlotM2 > 0 ? price / l.areaPlotM2 : null);
  if (has(ppp)) {
    const v = lowerIsBetter(ppp, HOUSE.pricePerPlotM2Band.good, HOUSE.pricePerPlotM2Band.bad);
    parts.push({
      w: w.pricePerPlotM2,
      v,
      label: `Preis/Grundstücks-m² ${Math.round(ppp)} € (${qualify(v, "sehr gut", "im Rahmen", "hoch")})`,
    });
  }

  const loc = getLocationScore(l.locationRaw ?? null);
  if (loc) {
    parts.push({
      w: w.locationScore,
      v: (loc.score - 1) / 9,
      label: `Ort ${loc.place} (${loc.score}/10)`,
    });
  }

  if (has(l.areaLivingM2)) {
    const inSpot = l.areaLivingM2 >= HOUSE.sweetSpot.livingM2Min && l.areaLivingM2 <= HOUSE.sweetSpot.livingM2Max;
    // Über dem Sweet Spot neutral (kein Abzug, kein Bonus) -> v=0.5 erzeugt keinen Breakdown-Eintrag
    parts.push({
      w: w.livingSize,
      v: inSpot ? 1 : 0.5,
      label: `${Math.round(l.areaLivingM2)} m² Wohnfläche im Sweet Spot 80-140`,
    });
  }
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
    parts.push({
      w: w.plotSize,
      v,
      label:
        v === 1
          ? `Grundstück ${Math.round(a)} m² im Sweet Spot 300-400`
          : `Grundstück ${Math.round(a)} m²`,
    });
  }

  if (has(l.rooms)) {
    const v = l.rooms >= HOUSE.sweetSpot.roomsIdeal ? 1 : 0.4; // Hard-Filter garantiert >= 3
    parts.push({
      w: w.rooms,
      v,
      label: l.rooms >= HOUSE.sweetSpot.roomsIdeal ? `${l.rooms} Zimmer (Ideal erreicht)` : `${l.rooms} Zimmer (Minimum)`,
    });
  }
  if (has(l.bathroomCount) && l.bathroomCount >= 1) {
    const v = l.bathroomCount >= HOUSE.sweetSpot.bathroomsIdeal ? 1 : 0.6;
    parts.push({ w: w.bathroom, v, label: `${l.bathroomCount} Bad/Bäder` });
  }

  // Ausstattung: einseitig positiv, zählt nur bei bekanntem true (bzw. explizitem false bei Garten)
  if (l.hasGarden != null) parts.push({ w: w.garden, v: l.hasGarden ? 1 : 0.2, label: l.hasGarden ? "Garten vorhanden" : "Kein Garten" });
  if (l.hasParkingSpot === true) parts.push({ w: w.parking, v: 1, label: "Stellplatz vorhanden" });
  if (l.hasGarage === true) parts.push({ w: w.garage, v: 1, label: "Garage vorhanden" });
  if (l.hasPool === true) parts.push({ w: w.pool, v: 1, label: "Pool vorhanden" });
  if (l.hasAuxiliaryBuilding === true) parts.push({ w: w.auxBuilding, v: 1, label: "Nebengebäude (z. B. Sommerküche)" });
  if (l.hasAirConditioning === true) parts.push({ w: w.airConditioning, v: 1, label: "Klimaanlage" });

  // Baujahr/Renovierung, gestuft (2020 Basis, 2022 mehr, 2024 Maximum)
  const modernYear = Math.max(l.yearBuilt ?? 0, l.yearRenovated ?? 0);
  if (modernYear > 0) {
    const t = HOUSE.modernTiers;
    const v = modernYear >= t.max ? 1 : modernYear >= t.better ? 0.8 : modernYear >= t.base ? 0.6 : modernYear >= 2010 ? 0.35 : 0.1;
    parts.push({
      w: w.modern,
      v,
      label: `${l.yearRenovated && l.yearRenovated >= (l.yearBuilt ?? 0) ? "Renoviert" : "Baujahr"} ${modernYear}`,
    });
  }
  if (l.renovationNeeded != null) {
    const map = { none: 1, light: 0.8, moderate: 0.4, heavy: 0 } as const;
    const txt = { none: "Kein Renovierungsbedarf", light: "Leichter Renovierungsbedarf", moderate: "Mittlerer Renovierungsbedarf", heavy: "Starker Renovierungsbedarf" } as const;
    parts.push({ w: w.renovation, v: map[l.renovationNeeded], label: txt[l.renovationNeeded] });
  }
  if (l.hasSeaViewLikely === true) parts.push({ w: w.seaView, v: 1, label: "Meerblick wahrscheinlich" });
  if (l.looksLikeTouristRental === true) parts.push({ w: w.touristPenalty, v: 0, label: "Wirkt wie Ferienvermietungs-Objekt" });

  if (has(l.aiImageScore)) {
    parts.push({
      w: w.aiImage,
      v: clamp01(l.aiImageScore / 100),
      label: `KI-Bildeindruck ${l.aiImageScore}/100`,
    });
  }

  return { parts, loc: loc?.score ?? null };
}

// ---------------------------------------------------------------- Grundstücke
function scoreLand(l: Scorable): { parts: Part[]; loc: number | null } {
  const w = WEIGHTS.land;
  const parts: Part[] = [];
  const price = l.displayPriceEur ?? l.priceEur;

  const ppm = l.pricePerM2 ?? (has(l.areaPlotM2) && l.areaPlotM2 > 0 ? price / l.areaPlotM2 : null);
  if (has(ppm)) {
    const v = lowerIsBetter(ppm, LAND.pricePerM2Band.good, LAND.pricePerM2Band.bad);
    parts.push({
      w: w.pricePerM2,
      v,
      label: `Preis/m² ${Math.round(ppm)} € (${qualify(v, "sehr gut", "im Rahmen", "hoch")})`,
    });
  }

  const loc = getLocationScore(l.locationRaw ?? null);
  if (loc) {
    parts.push({
      w: w.locationScore,
      v: (loc.score - 1) / 9,
      label: `Ort ${loc.place} (${loc.score}/10)`,
    });
  }

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
    parts.push({
      w: w.plotSize,
      v,
      label:
        a >= s.idealMin && a <= s.idealMax
          ? `${Math.round(a)} m², passt zum Sweet Spot 700-800`
          : `${Math.round(a)} m² Fläche`,
    });
  }

  if (has(l.aiImageScore)) {
    parts.push({
      w: w.aiImage,
      v: clamp01(l.aiImageScore / 100),
      label: `KI-Bildeindruck ${l.aiImageScore}/100`,
    });
  }

  // Zonierung: bestätigt = Plus, gar nicht angegeben = Abwertung + Hinweis (SPEC §9)
  if (l.zoningConfirmedBuildingLand === true) {
    parts.push({ w: w.zoningUnclear, v: 1, label: "Baugrund bestätigt" });
  } else if (l.zoningStated === false || l.zoningStated == null) {
    parts.push({ w: w.zoningUnclear, v: 0, label: "Zonierung unklar, bitte selbst prüfen" });
  }

  return { parts, loc: loc?.score ?? null };
}

// ---------------------------------------------------------------- Autos
/** Unfall/Schäden aus der Beschreibung erkennen (SPEC §5, leichter Minuspunkt). */
function detectAccidentMention(text: string): boolean {
  return /unfall|hagelschaden|besch[äa]digt|kratzer|delle|lackschaden|reparaturbedarf|accident|damaged/i.test(
    text,
  );
}

function scoreCar(l: Scorable): { parts: Part[]; loc: number | null } {
  const w = WEIGHTS.car;
  const parts: Part[] = [];
  const price = l.displayPriceEur ?? l.priceEur;

  if (l.hasAdaptiveCruiseControl === true)
    parts.push({ w: w.adaptiveCruise, v: 1, label: "Adaptiver Tempomat (ACC)" });
  if (l.hasParkingCamera === true)
    parts.push({ w: w.parkingCamera, v: 1, label: "Einparkhilfe mit Kamera" });

  if (l.infotainmentGeneration != null && l.infotainmentGeneration !== "unknown") {
    const map = { latest: 1, previous: 0.35, older: 0 } as const;
    const txt = {
      latest: "Neuestes Infotainment-System",
      previous: "Infotainment der Vorgänger-Generation",
      older: "Älteres Infotainment-System",
    } as const;
    parts.push({
      w: w.infotainmentLatest,
      v: map[l.infotainmentGeneration],
      label: txt[l.infotainmentGeneration],
    });
  }

  if (l.description && detectAccidentMention(l.description)) {
    parts.push({ w: w.accidentPenalty, v: 0, label: "Unfall/Schäden in Beschreibung erwähnt" });
  }

  if (l.make) {
    const preferred = CAR.soft.preferredMakes.map((m) => m.toLowerCase());
    const isPref = preferred.some((m) => l.make!.toLowerCase().includes(m));
    parts.push({
      w: w.preferredMake,
      v: isPref ? 1 : 0.4,
      label: isPref ? `${l.make} (bevorzugte Marke)` : `Marke ${l.make}`,
    });
  }

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
    parts.push({ w: w.bodyStyle, v: map[l.bodyType], label: txt[l.bodyType] });
  }

  if (has(l.powerPs)) {
    const v = l.powerPs >= CAR.soft.bonusPowerPs ? 1 : clamp01((l.powerPs - CAR.hard.powerPsMin) / (CAR.soft.bonusPowerPs - CAR.hard.powerPsMin)) * 0.6;
    parts.push({
      w: w.powerBonus,
      v,
      label: l.powerPs >= CAR.soft.bonusPowerPs ? `${l.powerPs} PS (>= 150)` : `${l.powerPs} PS`,
    });
  }

  if (has(l.mileageKm)) {
    const v = lowerIsBetter(l.mileageKm, 0, CAR.hard.mileageKmMax);
    parts.push({
      w: w.lowMileage,
      v,
      label: `${Math.round(l.mileageKm / 1000)} tkm (${qualify(v, "sehr wenig", "ok", "viel")})`,
    });
  }
  if (has(l.firstRegistrationYear)) {
    const v = clamp01((l.firstRegistrationYear - CAR.hard.firstRegistrationYearMin) / 3);
    parts.push({ w: w.newerYear, v, label: `Erstzulassung ${l.firstRegistrationYear}` });
  }
  {
    const v = lowerIsBetter(price, CAR.hard.priceMin, CAR.hard.priceMax);
    parts.push({
      w: w.lowerPrice,
      v,
      label: `Preis ${Math.round(price / 1000)}k € im Band (${qualify(v, "günstig", "mittig", "oben")})`,
    });
  }

  return { parts, loc: null };
}

/**
 * Berechnet Gesamt-Score (0-100), Breakdown und Location-Score eines
 * normalisierten Inserats. Anzeige-Logik: `scoreOverride ?? score` (SPEC §9).
 */
export function computeScore(l: Scorable): ScoreResult {
  const { parts, loc } =
    l.vertical === "house" ? scoreHouse(l) : l.vertical === "land" ? scoreLand(l) : scoreCar(l);
  return { score: totalScore(parts), breakdown: toBreakdown(parts), locationScore: loc };
}
