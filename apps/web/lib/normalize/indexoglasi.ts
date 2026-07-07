// Normalizer für den eigenen Index-Oglasi-Actor (cinnamon_badge/index-oglasi-scraper).
// Felder per Test-Run verifiziert: Ortsnamen kommen aus permutiveData.location
// (["HRVATSKA","Zadarska","Zadar","Borik"]); Bild-URLs sind relativ und der
// CDN-Host ist (noch) unbekannt -> images bleibt vorerst leer.
import { createHash } from "node:crypto";
import type { NormalizedListing } from "./types";
import { extractAreas, extractRooms, extractYearBuilt } from "./text-extract";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function makeId(source: string, sourceListingId: string): string {
  return createHash("sha256").update(`${source}:${sourceListingId}`).digest("hex").slice(0, 24);
}

function detectZoning(text: string): {
  zoningStated: boolean;
  zoningConfirmedBuildingLand: boolean | null;
} {
  const isBuilding = /gra[dđ]evinsk|bauland|building\s*land/i.test(text);
  const isAgricultural = /poljoprivredn|agricultur|ackerland|landwirtschaft/i.test(text);
  return {
    zoningStated: isBuilding || isAgricultural,
    zoningConfirmedBuildingLand: isBuilding ? true : isAgricultural ? false : null,
  };
}

export function normalizeIndexOglasi(raw: Any): NormalizedListing | null {
  const sourceListingId = raw?.code != null ? String(raw.code) : raw?.id ? String(raw.id) : "";
  if (!sourceListingId) return null;

  const category: string = raw.category ?? "";
  const vertical = category.includes("land") ? "land" : "house";

  const price = Math.round(Number(raw.price ?? 0)); // 1-Euro-Fakes fängt lib/enrich.ts
  const titleText = String(raw.title ?? "");
  const fromText = extractAreas(titleText);
  const area =
    (raw?.summary?.area != null ? Number(raw.summary.area) : null) ??
    (vertical === "land" ? (fromText.plot ?? fromText.any) : (fromText.living ?? fromText.any));

  // permutiveData.location: ["HRVATSKA", "Zadarska", "Zadar", "Borik"] (grob -> fein)
  const loc: string[] = Array.isArray(raw?.permutiveData?.location) ? raw.permutiveData.location : [];
  const locFine = loc.slice(1); // "HRVATSKA" weglassen
  const locationRaw =
    (Array.isArray(raw._locationNames) && raw._locationNames.length > 0
      ? raw._locationNames.join(", ")
      : locFine.join(", ")) || "";

  const title = String(raw.title ?? "");
  const pricePerM2 = raw.priceM2 != null ? Number(raw.priceM2) : null;

  return {
    id: makeId("indexoglasi", sourceListingId),
    source: "indexoglasi",
    sourceListingId,
    vertical,
    url: raw.smartLink
      ? `https://www.index.hr/oglasi/${raw.smartLink}/${raw.code ?? ""}`
      : "https://www.index.hr/oglasi",
    title,
    priceEur: price,
    images: [], // CDN-Host unbekannt (relative Pfade) — offener Punkt
    description: null, // Suchliste liefert keine Beschreibung; Detail-Scrape später
    locationRaw,
    locationCity: locFine[1] ?? null, // z. B. "Zadar"
    locationRegion: locFine[0] ?? null, // z. B. "Zadarska"
    lat: null,
    lng: null,
    postedAt: raw.postedTime ? new Date(raw.postedTime) : null,

    areaLivingM2: vertical === "house" ? area : null,
    areaPlotM2: vertical === "land" ? area : (fromText.plot ?? null),
    rooms: vertical === "house" ? extractRooms(titleText) : null,
    yearBuilt:
      (raw?.summary?.yearBuilt != null ? Number(raw.summary.yearBuilt) : null) ??
      (vertical === "house" ? extractYearBuilt(titleText) : null),
    yearRenovated: null,
    hasGarden: null,
    pricePerLivingM2:
      vertical === "house"
        ? (pricePerM2 ?? (area && area > 0 && price > 1 ? Math.round((price / area) * 100) / 100 : null))
        : null,
    pricePerPlotM2: null,
    ...(vertical === "land"
      ? detectZoning(`${title} ${category}`)
      : { zoningStated: null, zoningConfirmedBuildingLand: null }),
    pricePerM2:
      vertical === "land"
        ? (pricePerM2 ?? (area && area > 0 && price > 1 ? Math.round((price / area) * 100) / 100 : null))
        : null,

    raw,
  };
}
