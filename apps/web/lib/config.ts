// lib/config.ts — Zentrale Filter, Orte, Gewichte und Finanzierungs-Parameter
// (SPEC §5, §7, §10 + ORTE_LOCATION_SCORE.md). Hard = Ausschluss, Soft = fließt in den Score.

/** Ismaning (PLZ 85737) — Bezugspunkt für die Auto-Entfernung. */
export const ISMANING = { plz: "85737", lat: 48.2236, lng: 11.6717 };

/** Orte-Allowlist für Häuser UND Grundstücke (SPEC §5, Hard-Filter). */
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

/**
 * Location-Score 1-10 je Ort (ORTE_LOCATION_SCORE.md, 10 = am besten).
 * Fließt in den Gesamt-Score ein, ist KEIN eigener Anzeige-Score (SPEC §5).
 */
export const LOCATION_SCORES: ReadonlyArray<{ place: string; score: number }> = [
  { place: "Bibinje", score: 10 },
  { place: "Sukošan", score: 9 },
  { place: "Kožino", score: 9 },
  { place: "Diklo", score: 9 },
  { place: "Petrčane", score: 8 },
  { place: "Zaton", score: 8 },
  { place: "Nin", score: 8 },
  { place: "Sveti Petar na Moru", score: 8 },
  { place: "Sveti Filip i Jakov", score: 8 },
  { place: "Turanj", score: 7 },
  { place: "Privlaka", score: 7 },
  { place: "Vrsi", score: 7 },
  { place: "Debeljak", score: 7 },
  { place: "Gorica", score: 6 },
  { place: "Glavica", score: 6 },
  { place: "Ražanac", score: 6 },
  { place: "Posedarje", score: 6 },
  { place: "Vinjerac", score: 5 },
  { place: "Grbe", score: 5 },
  { place: "Ninski Stanovi", score: 5 },
  { place: "Ljubački Stanovi", score: 5 }, // vor "Ljubač" matchen (längerer Name zuerst)
  { place: "Ljubač", score: 5 },
  { place: "Rtina", score: 5 },
  { place: "Poličnik", score: 5 },
  { place: "Sikovo", score: 5 },
  { place: "Donje Raštane", score: 5 },
  { place: "Gornje Raštane", score: 4 },
  { place: "Žerava", score: 4 },
  { place: "Poljica", score: 4 },
  { place: "Galovac", score: 4 },
  { place: "Zemunik Gornji", score: 3 }, // vor "Zemunik Donji"-Fallback prüfen
  { place: "Zemunik Donji", score: 4 },
  { place: "Škabrnja", score: 4 },
  { place: "Suhovare", score: 4 },
  { place: "Murvica", score: 4 },
  { place: "Briševo", score: 4 },
  { place: "Dračevac Ninski", score: 4 },
  { place: "Podgradina", score: 4 },
  { place: "Ždrilo", score: 4 },
  { place: "Slivnica", score: 3 },
  { place: "Krneza", score: 3 },
  { place: "Podvršje", score: 3 },
  { place: "Smoković", score: 3 },
  { place: "Prkos", score: 3 },
  { place: "Visočane", score: 3 },
  { place: "Lovinac", score: 3 },
  { place: "Rupalj", score: 3 },
  { place: "Jovići", score: 2 },
  { place: "Radovin", score: 2 },
  // Zadar-Stadt selbst: nicht in der Ortstabelle, aber in der Allowlist.
  // Stadtküste ist über Diklo/Kožino abgedeckt; Zadar generisch solide angesetzt.
  { place: "Zadar", score: 7 },
];

// Längere Namen zuerst matchen ("Ljubački Stanovi" vor "Ljubač", "Zemunik Gornji" vor "Zadar" etc.)
const LOCATION_SCORES_NORM = LOCATION_SCORES.map((e) => ({
  norm: normalizePlace(e.place),
  place: e.place,
  score: e.score,
})).sort((a, b) => b.norm.length - a.norm.length);

/** Location-Score (1-10) + gematchter Ortsname aus einem rohen Ortsstring. */
export function getLocationScore(
  raw?: string | null,
): { score: number; place: string } | null {
  if (!raw) return null;
  const n = normalizePlace(raw);
  const hit = LOCATION_SCORES_NORM.find((e) => n.includes(e.norm));
  return hit ? { score: hit.score, place: hit.place } : null;
}

/** Häuser — Hard-Filter, Sweet Spots und Score-Bänder (SPEC §5). */
export const HOUSE = {
  hard: {
    priceMin: 100_000,
    priceMax: 400_000,
    areaLivingM2Min: 80,
    roomsMin: 3, // reine Wohnräume ohne Küche/Bad (SPEC §4)
  },
  sweetSpot: {
    livingM2Min: 80,
    livingM2Max: 140, // darüber neutral, kein Abzug
    plotM2Min: 300,
    plotM2Max: 400,
    roomsIdeal: 4,
    bathroomsIdeal: 2,
  },
  // Baujahr/Renovierung gestuft: je neuer desto mehr Punkte (SPEC §5)
  modernTiers: { base: 2020, better: 2022, max: 2024 },
  // Score-Normalisierung "niedriger = besser" (good -> volle Punkte, bad -> 0)
  pricePerLivingM2Band: { good: 1200, bad: 4000 },
  pricePerPlotM2Band: { good: 250, bad: 1000 },
} as const;

/** Grundstücke — Hard-Filter und Score-Bänder (SPEC §5). */
export const LAND = {
  hard: {
    priceMin: 10_000,
    priceMax: 110_000,
    pricePerM2Max: 100, // eine der beiden Preisbedingungen reicht
  },
  sweetSpot: { plotM2Min: 400, idealMin: 700, idealMax: 800 },
  pricePerM2Band: { good: 30, bad: 100 },
} as const;

/** Autos — Hard-Filter und Soft-Präferenzen (SPEC §5, aktualisierte Werte). */
export const CAR = {
  hard: {
    priceMin: 18_000, // aktualisiert (war 20000)
    priceMax: 30_000,
    firstRegistrationYearMin: 2023, // aktualisiert (war 2022)
    transmission: "automatic" as const,
    powerPsMin: 110, // aktualisiert (war 130)
    mileageKmMax: 70_000,
    distanceFromIsmaningKmMax: 200,
    // Kraftstoff ist jetzt HARD: reiner Benziner fliegt raus (SPEC §5)
    allowedFuels: ["diesel", "hybrid_petrol", "hybrid_diesel", "electric"] as const,
    electricMinRangeKm: 500,
  },
  soft: {
    preferredMakes: ["Audi", "BMW", "Mercedes"], // Cupra/VW raus aus der Bevorzugung
    preferredBodyType: "limousine" as const,
    bonusPowerPs: 150, // ab hier Zusatzpunkte (Referenz: aktueller Wagen)
  },
} as const;

/**
 * Finanzierungs-Rechner (SPEC §5): einmalige Parameter, Monatsrate pro Inserat.
 * Zinssatz ist ein RICHTWERT (Marktdurchschnitt Ratenkredit, Stand Juli 2026),
 * bonitätsabhängig — bei Bank/Vergleichsportal verifizieren.
 */
export const FINANCING = {
  ownFundsEur: 18_500, // voraussichtlicher Verkaufserlös aktuelles Auto
  maxLoanEur: 12_000,
  loanTermMonths: 48,
  annualInterestRate: 0.07, // 7 % effektiv, Richtwert
} as const;

/**
 * Score-Gewichte je Vertical (benannte Konstanten, frei justierbar).
 * Der Score ist EIN Gesamtwert 0-100 (SPEC §5); `scoreBreakdown` erklärt ihn.
 * Einseitige Kriterien (z. B. Pool, ACC) zählen nur, wenn die Info vorliegt.
 */
export const WEIGHTS = {
  house: {
    pricePerM2: 20, // Preis pro Wohn-m² (stärkstes Gewicht, mit pricePerPlotM2)
    pricePerPlotM2: 10,
    locationScore: 15,
    livingSize: 5, // Sweet Spot 80-140 m²
    plotSize: 6, // Sweet Spot 300-400 m²
    rooms: 6, // 4 Zimmer = Ideal
    bathroom: 4,
    garden: 5,
    parking: 7, // starkes Plus (eigentlich als gegeben erwartet)
    garage: 2, // nice to have
    pool: 3,
    auxBuilding: 3, // Sommerküche/Gästehaus
    airConditioning: 6, // starkes Plus
    modern: 10, // Baujahr/Renovierung gestuft
    renovation: 6,
    seaView: 4,
    touristPenalty: 4, // Minus bei Ferienvilla-Optik
    aiImage: 8,
  },
  land: {
    pricePerM2: 40, // stärkstes Gewicht
    locationScore: 25,
    plotSize: 15, // nahe Sweet Spot 700-800 m²
    aiImage: 12,
    zoningUnclear: 8, // Abwertung, wenn keine Zonierung angegeben
  },
  car: {
    adaptiveCruise: 14, // starkes Plus (bewusst soft, SPEC §5)
    infotainmentLatest: 14, // starkes Plus bei neuester Generation
    parkingCamera: 6,
    accidentPenalty: 6, // leichter Minus bei Unfall/Kratzern aus Beschreibung
    preferredMake: 12, // Audi/BMW/Mercedes deutlich bevorzugt (Feedback Ante 07/2026)
    bodyStyle: 14, // Limousine top, Sportback (Golf & Co.) klarer Minus, SUV nur als Coupé-SUV gut
    powerBonus: 8, // >= 150 PS
    lowMileage: 16,
    newerYear: 10,
    lowerPrice: 10,
  },
} as const;

/**
 * Quellen (SPEC §7/§8). Fertige Actors vor Einsatz real prüfen (Input/Output).
 * indexoglasi und autohero sind EIGENE Crawlee-Actors (kein fertiger Actor verfügbar).
 */
export const SUGGESTED_ACTORS = {
  njuskalo: "logiover/njuskalo-hr-property-scraper", // alt: memo23/njuskalo-scraper
  autoscout24: "memo23/autoscout24-scraper", // alt: solidcode/autoscout24-scraper
  mobilede: "memo23/mobile-de-scraper",
  indexoglasi: "eigener Crawlee-Actor (actors/index-oglasi)",
  autohero: "eigener Crawlee-Actor (actors/autohero)",
} as const;
