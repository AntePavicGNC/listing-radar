// Normalizer für den Apify-Actor logiover/njuskalo-hr-property-scraper.
// Feldnamen wurden per echtem Test-Run verifiziert (SPEC §4/§7).
import { createHash } from "node:crypto";
import type { NormalizedListing } from "./types";

export function makeId(source: string, sourceListingId: string): string {
  return createHash("sha256").update(`${source}:${sourceListingId}`).digest("hex").slice(0, 24);
}

function toNum(x: unknown): number | null {
  const n = typeof x === "string" ? parseFloat(x) : typeof x === "number" ? x : NaN;
  return Number.isFinite(n) ? n : null;
}

type NjuskaloItem = Record<string, unknown>;

// Zonierung aus Titel/Beschreibung ableiten (SPEC §4/§9): erwähnt der Text überhaupt
// eine Zonierung, und ist Baugrund klar bestätigt? Feinprüfung folgt im Enrichment (Phase 7).
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

export function normalizeNjuskalo(raw: NjuskaloItem): NormalizedListing | null {
  const sourceListingId = raw.adId != null ? String(raw.adId) : "";
  if (!sourceListingId) return null;

  const vertical = raw.propertyType === "land" ? "land" : "house";
  const images = Array.isArray(raw.imageUrls)
    ? (raw.imageUrls as string[])
    : raw.mainImageUrl
      ? [String(raw.mainImageUrl)]
      : [];
  const areaLiving = toNum(raw.areaSqm);
  const areaPlot = toNum(raw.terrainAreaSqm);
  const price = Math.round(toNum(raw.price) ?? 0);

  const locationRaw =
    (raw.fullAddress as string) ||
    [raw.city, raw.district, raw.microLocation].filter(Boolean).join(", ");

  return {
    id: makeId("njuskalo", sourceListingId),
    source: "njuskalo",
    sourceListingId,
    vertical,
    url: String(raw.detailUrl ?? ""),
    title: String(raw.title ?? ""),
    priceEur: price,
    images,
    description: (raw.shortDescription as string) ?? null,
    locationRaw,
    locationCity: (raw.city as string) ?? null,
    locationRegion: (raw.district as string) ?? (raw.municipality as string) ?? null,
    lat: toNum(raw.latitude),
    lng: toNum(raw.longitude),
    postedAt: raw.datePosted ? new Date(String(raw.datePosted)) : null,

    areaLivingM2: vertical === "house" ? areaLiving : null,
    areaPlotM2: areaPlot ?? (vertical === "land" ? areaLiving : null),
    rooms: toNum(raw.rooms),
    yearBuilt: toNum(raw.yearBuilt),
    yearRenovated: null,
    // Njuskalo liefert kein explizites Garten-Feld; Grundstücksfläche als Heuristik.
    hasGarden: areaPlot != null && areaPlot > 0 ? true : null,
    pricePerLivingM2: vertical === "house" ? toNum(raw.pricePerSqm) : null,
    pricePerPlotM2:
      vertical === "house" && areaPlot != null && areaPlot > 0
        ? Math.round((price / areaPlot) * 100) / 100
        : null,
    ...(vertical === "land"
      ? detectZoning(`${raw.title ?? ""} ${raw.shortDescription ?? ""}`)
      : { zoningStated: null, zoningConfirmedBuildingLand: null }),
    pricePerM2: vertical === "land" ? toNum(raw.pricePerSqm) : null,

    raw,
  };
}
