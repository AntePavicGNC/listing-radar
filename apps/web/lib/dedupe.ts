// Dedupe-Kandidaten-Key (SPEC §6): gerundeter Preis + Fläche (bzw. km) + Stadt.
// v1 merged nicht hart, sondern markiert mögliche Duplikate über denselben Key.
import type { NormalizedListing } from "./normalize/types";

function roundTo(n: number | null | undefined, step: number): number | null {
  if (n == null) return null;
  return Math.round(n / step) * step;
}

export function dedupeKey(l: NormalizedListing): string {
  const city = (l.locationCity ?? "").toLowerCase().trim();
  const price = roundTo(l.priceEur, 5000);
  const size =
    l.vertical === "car"
      ? roundTo(l.mileageKm, 5000)
      : roundTo(l.areaLivingM2 ?? l.areaPlotM2, 10);
  return `${l.vertical}|${city}|${price}|${size}`;
}
