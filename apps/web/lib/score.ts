// lib/score.ts — Scoring je Vertical (SPEC §5). Ergebnis 0–100, höher = besser.
import { WEIGHTS, HOUSE, LAND, CAR } from "./config";

type Vertical = "house" | "land" | "car";

export interface Scorable {
  vertical: Vertical;
  priceEur: number;
  // Haus / Grundstück
  rooms?: number | null;
  hasGarden?: boolean | null;
  yearBuilt?: number | null;
  yearRenovated?: number | null;
  pricePerLivingM2?: number | null;
  pricePerM2?: number | null;
  aiImageScore?: number | null;
  // Auto
  mileageKm?: number | null;
  firstRegistrationYear?: number | null;
  fuel?: string | null;
  make?: string | null;
  bodyType?: string | null;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Niedriger Wert = besser, linear normiert über ein Band [good, bad] -> 1..0. */
function lowerIsBetter(value: number, good: number, bad: number): number {
  if (bad === good) return 0.5;
  return clamp01((bad - value) / (bad - good));
}

function num(x?: number | null): number | null {
  return typeof x === "number" && !Number.isNaN(x) ? x : null;
}

/** Gewichteter Schnitt der VERFÜGBAREN Kriterien -> 0..100. Fehlende Kriterien sind neutral. */
function weightedAverage(parts: Array<{ w: number; v: number } | null>): number {
  const present = parts.filter((p): p is { w: number; v: number } => p !== null);
  const totalW = present.reduce((s, p) => s + p.w, 0);
  if (totalW === 0) return 0;
  const sum = present.reduce((s, p) => s + p.w * p.v, 0);
  return Math.round((sum / totalW) * 100);
}

function scoreHouse(l: Scorable): number {
  const w = WEIGHTS.house;
  return weightedAverage([
    num(l.rooms) !== null
      ? { w: w.rooms, v: (l.rooms as number) >= HOUSE.soft.roomsMin ? 1 : 0 }
      : null,
    l.hasGarden != null ? { w: w.garden, v: l.hasGarden ? 1 : 0 } : null,
    num(l.yearBuilt) !== null || num(l.yearRenovated) !== null
      ? {
          w: w.modern,
          v:
            (l.yearBuilt ?? 0) >= HOUSE.soft.modernYearMin ||
            (l.yearRenovated ?? 0) >= HOUSE.soft.modernYearMin
              ? 1
              : 0,
        }
      : null,
    num(l.pricePerLivingM2) !== null
      ? {
          w: w.pricePerM2,
          v: lowerIsBetter(l.pricePerLivingM2 as number, HOUSE.pricePerM2Band.good, HOUSE.pricePerM2Band.bad),
        }
      : null,
    num(l.aiImageScore) !== null
      ? { w: w.aiImage, v: clamp01((l.aiImageScore as number) / 100) }
      : null,
  ]);
}

function scoreLand(l: Scorable): number {
  const w = WEIGHTS.land;
  return weightedAverage([
    num(l.pricePerM2) !== null
      ? {
          w: w.pricePerM2,
          v: lowerIsBetter(l.pricePerM2 as number, LAND.pricePerM2Band.good, LAND.pricePerM2Band.bad),
        }
      : null,
    num(l.aiImageScore) !== null
      ? { w: w.aiImage, v: clamp01((l.aiImageScore as number) / 100) }
      : null,
  ]);
}

function scoreCar(l: Scorable): number {
  const w = WEIGHTS.car;
  return weightedAverage([
    l.fuel != null ? { w: w.dieselFuel, v: l.fuel === CAR.soft.preferredFuel ? 1 : 0 } : null,
    l.make != null
      ? {
          w: w.preferredMake,
          v: CAR.soft.preferredMakes.map((m) => m.toLowerCase()).includes(l.make.toLowerCase()) ? 1 : 0,
        }
      : null,
    l.bodyType != null
      ? { w: w.limousine, v: l.bodyType.toLowerCase().includes(CAR.soft.preferredBodyType) ? 1 : 0 }
      : null,
    num(l.mileageKm) !== null
      ? { w: w.lowMileage, v: lowerIsBetter(l.mileageKm as number, 0, CAR.hard.mileageKmMax) }
      : null,
    num(l.firstRegistrationYear) !== null
      ? {
          w: w.newerYear,
          v: clamp01(((l.firstRegistrationYear as number) - CAR.hard.firstRegistrationYearMin) / 4),
        }
      : null,
    { w: w.lowerPrice, v: lowerIsBetter(l.priceEur, CAR.hard.priceMin, CAR.hard.priceMax) },
  ]);
}

/** Berechnet den 0–100-Score eines normalisierten Inserats je nach Vertical. */
export function computeScore(l: Scorable): number {
  if (l.vertical === "house") return scoreHouse(l);
  if (l.vertical === "land") return scoreLand(l);
  return scoreCar(l);
}
