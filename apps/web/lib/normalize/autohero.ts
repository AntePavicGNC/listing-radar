// Normalizer für den eigenen AutoHero-Actor (cinnamon_badge/autohero-scraper).
// Felder per Test-Run verifiziert. AutoHero ist Händler-Inventar mit Lieferung —
// es gibt keinen Fahrzeug-Standort; distanceFromIsmaningKm bleibt null (Lieferung).
import type { NormalizedListing, Fuel } from "./types";
import { makeId, detectAcc, detectParkingCamera } from "./car-common";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Empirisch aus Test-Run abgeleitet (TSI->1039, TDI/HDi->1040, Hybrid->1046)
const FUEL_CODES: Record<number, Fuel> = {
  1039: "petrol",
  1040: "diesel",
  1046: "hybrid_petrol",
};

/** Kraftstoff aus Motorbezeichnung verfeinern (Codes sind grob). */
function refineFuel(code: number | null, subType: string): Fuel | null {
  const st = subType.toLowerCase();
  if (/e-tron|electric|elektro|\bev\b|id\.\d/.test(st)) return "electric";
  if (/plug-?in|phev|e-?hybrid|etsi|tfsi\s*e/.test(st)) return "hybrid_petrol";
  if (/tdi|hdi|cdi|dci|blue-?hdi/.test(st)) {
    return /hybrid|mild/.test(st) ? "hybrid_diesel" : "diesel";
  }
  if (/hybrid/.test(st)) return "hybrid_petrol";
  if (code != null && FUEL_CODES[code]) return FUEL_CODES[code];
  if (/tsi|tfsi|tgdi|1\.\d|2\.\d/.test(st)) return "petrol";
  return null;
}

export function normalizeAutohero(raw: Any): NormalizedListing | null {
  const id = raw?.id != null ? String(raw.id) : "";
  if (!id) return null;

  const price =
    raw?.offerPrice?.amountMinorUnits != null
      ? Math.round(raw.offerPrice.amountMinorUnits / (raw.offerPrice.conversionMajor ?? 100))
      : null;
  if (price == null) return null;

  const subType = `${raw.subType ?? ""} ${raw.subTypeExtra ?? ""}`.trim();
  const fuel = refineFuel(raw.fuelType ?? null, subType);
  // 20240611T... bzw. 20231116T000000.000Z -> Monat aus Position 4-6
  const reg: string = String(raw.registration ?? "");
  const regMonth = /^\d{8}T/.test(reg) ? Number(reg.slice(4, 6)) : null;

  const images = [raw.mainImageUrl, raw.ahMainImageUrl]
    .filter(Boolean)
    .map((u: string) => u.replace("{size}", ""));

  const accidents = Number(raw.numberOfAccidents ?? 0);
  const uspsText = `${(raw.usps ?? []).join(", ")} ${(raw.backofficeUsps ?? []).join(", ")}`;
  const descParts = [
    `${raw.manufacturer ?? ""} ${raw.model ?? ""} ${subType}`.trim(),
    raw.carPreownerCount != null ? `${raw.carPreownerCount} Vorbesitzer` : null,
    raw.hasFilledServiceBook ? "Scheckheftgepflegt" : null,
    accidents > 0 ? `[Unfall laut Inserat: ${accidents}]` : null,
    uspsText.trim() || null,
  ].filter(Boolean);

  return {
    id: makeId("autohero", id),
    source: "autohero",
    sourceListingId: id,
    vertical: "car",
    url: `https://www.autohero.com/de/details/${id}`,
    title: [raw.manufacturer, raw.model, subType].filter(Boolean).join(" "),
    priceEur: price,
    images,
    description: descParts.join("\n"),
    locationRaw: `AutoHero (Lieferung)${raw?.esBranch?.city ? ` · Logistik: ${raw.esBranch.city}` : ""}`,
    locationCity: raw?.esBranch?.city ?? null,
    locationRegion: raw?.countryCode ?? null,
    lat: null,
    lng: null,
    postedAt: raw.publishedAt ? new Date(String(raw.publishedAt).replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6")) : null,

    make: raw.manufacturer ?? null,
    model: raw.model ?? null,
    variant: subType || null,
    firstRegistrationYear: raw.firstRegistrationYear ?? raw.builtYear ?? null,
    firstRegistrationMonth: regMonth,
    mileageKm: raw?.mileage?.distance ?? null,
    fuel,
    rangeKm: null, // liefert AutoHero in der Suche nicht
    transmission: raw.gearType === 1139 ? "automatic" : raw.gearType === 1138 ? "manual" : null,
    powerPs: raw.kw != null ? Math.round(raw.kw * 1.35962) : null,
    bodyType: null, // nicht zuverlässig ableitbar; KI/Detail später
    // Lieferung frei Haus -> Entfernung nicht anwendbar (Filter toleriert null)
    distanceFromIsmaningKm: null,
    hasAdaptiveCruiseControl: detectAcc(uspsText),
    hasParkingCamera: detectParkingCamera(uspsText),

    raw,
  };
}
