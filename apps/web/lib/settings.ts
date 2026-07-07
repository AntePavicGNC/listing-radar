// Nutzer-justierbare Einstellungen (Feedback Ante 07/2026): Score-Gewichte und
// Hard-Filter-Grenzen liegen als Overrides in der DB (AppSetting) und werden
// über die Defaults aus lib/config.ts gemergt. UI: /settings.
import { prisma } from "./prisma";
import { WEIGHTS, HOUSE, LAND, CAR } from "./config";

export type Vertical = "house" | "land" | "car";

// ---------------------------------------------------------------- Gewichte

export type EffectiveWeights = {
  house: Record<keyof typeof WEIGHTS.house, number>;
  land: Record<keyof typeof WEIGHTS.land, number>;
  car: Record<keyof typeof WEIGHTS.car, number>;
};

export type WeightOverrides = {
  [V in Vertical]?: Record<string, number>;
};

/** Anzeige-Labels für die Settings-UI (Reihenfolge = Anzeige-Reihenfolge). */
export const WEIGHT_LABELS: Record<Vertical, Array<{ key: string; label: string }>> = {
  house: [
    { key: "pricePerM2", label: "Preis pro Wohn-m²" },
    { key: "pricePerPlotM2", label: "Preis pro Grundstücks-m²" },
    { key: "locationScore", label: "Location-Score (Ortstabelle)" },
    { key: "livingSize", label: "Wohnfläche (Sweet Spot 80–140 m²)" },
    { key: "plotSize", label: "Grundstücksgröße (Sweet Spot 300–400 m²)" },
    { key: "rooms", label: "Zimmerzahl (Ideal: 4)" },
    { key: "bathroom", label: "Bäder" },
    { key: "garden", label: "Garten" },
    { key: "parking", label: "Stellplatz" },
    { key: "garage", label: "Garage" },
    { key: "pool", label: "Pool" },
    { key: "auxBuilding", label: "Nebengebäude" },
    { key: "airConditioning", label: "Klimaanlage" },
    { key: "modern", label: "Baujahr/Renovierung (je neuer, desto besser)" },
    { key: "renovation", label: "Renovierungsbedarf (Rohbau = starker Abzug)" },
    { key: "seaView", label: "Meerblick (KI)" },
    { key: "touristPenalty", label: "Abzug Ferienvermietungs-Optik (KI)" },
    { key: "aiImage", label: "KI-Bildeindruck" },
  ],
  land: [
    { key: "pricePerM2", label: "Preis pro m²" },
    { key: "locationScore", label: "Location-Score (Ortstabelle)" },
    { key: "plotSize", label: "Fläche (Sweet Spot 700–800 m²)" },
    { key: "aiImage", label: "KI-Bildeindruck" },
    { key: "zoningUnclear", label: "Zonierung (Baugrund bestätigt vs. unklar)" },
  ],
  car: [
    { key: "preferredMake", label: "Bevorzugte Marke (Audi/BMW/Mercedes)" },
    { key: "bodyStyle", label: "Karosserie (Limousine top, Sportback Abzug)" },
    { key: "adaptiveCruise", label: "Adaptiver Tempomat (ACC)" },
    { key: "infotainmentLatest", label: "Neuestes Infotainment" },
    { key: "parkingCamera", label: "Einparkkamera" },
    { key: "accidentPenalty", label: "Abzug Unfall/Schäden erwähnt" },
    { key: "powerBonus", label: "Leistung (ab 150 PS Bonus)" },
    { key: "lowMileage", label: "Wenig Kilometer" },
    { key: "newerYear", label: "Neuere Erstzulassung" },
    { key: "lowerPrice", label: "Günstigerer Preis im Band" },
  ],
};

function mergeWeights(overrides: WeightOverrides | null): EffectiveWeights {
  const pick = <T extends Record<string, number>>(base: T, ov?: Partial<Record<string, number>>): T => {
    const out = { ...base } as Record<string, number>;
    for (const [k, v] of Object.entries(ov ?? {})) {
      if (k in out && typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100) out[k] = v;
    }
    return out as T;
  };
  return {
    house: pick({ ...WEIGHTS.house }, overrides?.house),
    land: pick({ ...WEIGHTS.land }, overrides?.land),
    car: pick({ ...WEIGHTS.car }, overrides?.car),
  };
}

// ---------------------------------------------------------------- Filter

/** Justierbare Hard-Filter-Grenzen (numerisch) mit Defaults aus config.ts. */
export const FILTER_DEFAULTS = {
  house: {
    priceMin: HOUSE.hard.priceMin,
    priceMax: HOUSE.hard.priceMax,
    areaLivingM2Min: HOUSE.hard.areaLivingM2Min,
    roomsMin: HOUSE.hard.roomsMin,
  },
  land: {
    priceMin: LAND.hard.priceMin,
    priceMax: LAND.hard.priceMax,
    pricePerM2Max: LAND.hard.pricePerM2Max,
  },
  car: {
    priceMin: CAR.hard.priceMin,
    priceMax: CAR.hard.priceMax,
    firstRegistrationYearMin: CAR.hard.firstRegistrationYearMin,
    powerPsMin: CAR.hard.powerPsMin,
    mileageKmMax: CAR.hard.mileageKmMax,
    distanceFromIsmaningKmMax: CAR.hard.distanceFromIsmaningKmMax,
  },
} as const;

export type EffectiveFilters = {
  house: Record<keyof typeof FILTER_DEFAULTS.house, number>;
  land: Record<keyof typeof FILTER_DEFAULTS.land, number>;
  car: Record<keyof typeof FILTER_DEFAULTS.car, number>;
};

export type FilterOverrides = {
  [V in Vertical]?: Record<string, number>;
};

export const FILTER_LABELS: Record<Vertical, Array<{ key: string; label: string; unit?: string }>> = {
  house: [
    { key: "priceMin", label: "Preis mindestens", unit: "€" },
    { key: "priceMax", label: "Preis höchstens", unit: "€" },
    { key: "areaLivingM2Min", label: "Wohnfläche mindestens", unit: "m²" },
    { key: "roomsMin", label: "Zimmer mindestens (wenn angegeben)" },
  ],
  land: [
    { key: "priceMin", label: "Preis mindestens", unit: "€" },
    { key: "priceMax", label: "Preis höchstens", unit: "€" },
    { key: "pricePerM2Max", label: "ODER €/m² höchstens", unit: "€/m²" },
  ],
  car: [
    { key: "priceMin", label: "Preis mindestens", unit: "€" },
    { key: "priceMax", label: "Preis höchstens", unit: "€" },
    { key: "firstRegistrationYearMin", label: "Erstzulassung ab (Jahr)" },
    { key: "powerPsMin", label: "Leistung mindestens", unit: "PS" },
    { key: "mileageKmMax", label: "Kilometer höchstens", unit: "km" },
    { key: "distanceFromIsmaningKmMax", label: "Entfernung Ismaning höchstens", unit: "km" },
  ],
};

function mergeFilters(overrides: FilterOverrides | null): EffectiveFilters {
  const pick = (base: Record<string, number>, ov?: Partial<Record<string, number>>) => {
    const out = { ...base };
    for (const [k, v] of Object.entries(ov ?? {})) {
      if (k in out && typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
    }
    return out;
  };
  return {
    house: pick({ ...FILTER_DEFAULTS.house }, overrides?.house) as EffectiveFilters["house"],
    land: pick({ ...FILTER_DEFAULTS.land }, overrides?.land) as EffectiveFilters["land"],
    car: pick({ ...FILTER_DEFAULTS.car }, overrides?.car) as EffectiveFilters["car"],
  };
}

// ---------------------------------------------------------------- Laden/Speichern

async function readSetting<T>(key: string): Promise<T | null> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    return (row?.value as T) ?? null;
  } catch {
    return null; // Tabelle fehlt o. Ä. -> Defaults verwenden, nie den Ingest brechen
  }
}

/** Effektive Gewichte + Filter (Defaults + DB-Overrides) in einem Rutsch. */
export async function getEffectiveSettings(): Promise<{
  weights: EffectiveWeights;
  filters: EffectiveFilters;
  weightOverrides: WeightOverrides;
  filterOverrides: FilterOverrides;
}> {
  const [w, f] = await Promise.all([
    readSetting<WeightOverrides>("weights"),
    readSetting<FilterOverrides>("filters"),
  ]);
  return {
    weights: mergeWeights(w),
    filters: mergeFilters(f),
    weightOverrides: w ?? {},
    filterOverrides: f ?? {},
  };
}

export async function saveSettingOverrides(
  key: "weights" | "filters",
  value: WeightOverrides | FilterOverrides,
): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
}
