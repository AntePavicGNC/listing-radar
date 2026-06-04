// lib/config.ts — Zentrale Filter, Orte und Gewichte (SPEC §5, §7, §10).
// Alle Filter sind final festgelegt. Hard = Ausschluss, Soft = beeinflusst nur den Score.

/** Ismaning (PLZ 85737) — Bezugspunkt für die Auto-Entfernung. */
export const ISMANING = { plz: "85737", lat: 48.2236, lng: 11.6717 };

/** Orte für Häuser UND Grundstücke. Matching ohne Diakritika (Portale schreiben uneinheitlich). */
export const ALLOWED_PLACES = [
  "Zadar",
  "Bibinje",
  "Sukošan",
  "Kožino",
  "Sveti Petar na Moru",
  "Petrčane",
  "Zaton",
  "Nin",
  "Vrsi",
  "Privlaka",
  "Ražanac",
  "Ljubač",
  "Diklo",
  "Radovin",
  "Poljica",
  "Jovići",
];

/** Diakritika entfernen + kleinschreiben, für robustes Ortsmatching. */
export function normalizePlace(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // kombinierende Akzente entfernen
    .toLowerCase()
    .trim();
}

const ALLOWED_PLACES_NORM = ALLOWED_PLACES.map(normalizePlace);

/** True, wenn der (Roh-)Ortsstring einen erlaubten Ort enthält. */
export function isAllowedPlace(raw?: string | null): boolean {
  if (!raw) return false;
  const n = normalizePlace(raw);
  return ALLOWED_PLACES_NORM.some((p) => n.includes(p));
}

/** Häuser — Hard-/Soft-Grenzen (SPEC §5). */
export const HOUSE = {
  hard: { priceMin: 100_000, priceMax: 400_000, areaLivingM2Min: 80 },
  soft: { roomsMin: 4, modernYearMin: 2020 },
  // Band für "EUR pro m² Wohnfläche" zur Score-Normalisierung (niedriger = besser)
  pricePerM2Band: { good: 1200, bad: 4000 },
} as const;

/** Grundstücke — Hard-/Soft-Grenzen (SPEC §5). Eine der beiden Preisbedingungen reicht. */
export const LAND = {
  hard: {
    priceMin: 10_000,
    priceMax: 110_000,
    pricePerM2Max: 100,
    zoningContains: "gradevinsko", // Baugrund
  },
  pricePerM2Band: { good: 30, bad: 100 },
} as const;

/** Autos — Hard-/Soft-Grenzen (SPEC §5, §10). */
export const CAR = {
  hard: {
    priceMin: 20_000,
    priceMax: 30_000,
    firstRegistrationYearMin: 2022,
    transmission: "automatic" as const,
    powerPsMin: 130,
    mileageKmMax: 70_000,
    distanceFromIsmaningKmMax: 200,
  },
  soft: {
    preferredFuel: "diesel" as const,
    preferredMakes: ["Audi", "BMW", "Mercedes", "Cupra", "VW"],
    preferredBodyType: "limousine",
  },
} as const;

/**
 * Score-Gewichte je Vertical (benannte Konstanten, frei justierbar).
 * Score = gewichteter Schnitt der verfügbaren Soft-Kriterien, normiert auf 0–100.
 */
export const WEIGHTS = {
  house: { rooms: 25, garden: 15, modern: 25, pricePerM2: 20, aiImage: 15 },
  land: { pricePerM2: 60, aiImage: 40 },
  car: { dieselFuel: 15, preferredMake: 20, limousine: 15, lowMileage: 25, newerYear: 15, lowerPrice: 10 },
} as const;

/**
 * Empfohlene Apify-Actors (SPEC §7) — Input-Schema und Output-Felder VOR Einsatz real prüfen,
 * IDs ggf. an tatsächlich verfügbare Actors anpassen.
 */
export const SUGGESTED_ACTORS = {
  njuskalo: "logiover/njuskalo-hr-property-scraper", // alt: memo23/njuskalo-scraper (Häuser + Grundstücke)
  autoscout24: "memo23/autoscout24-scraper", // alt: solidcode/autoscout24-scraper
  mobilede: "memo23/mobile-de-scraper",
} as const;
