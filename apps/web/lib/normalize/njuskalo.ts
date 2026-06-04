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
    // Zonierung (gradevinsko) für Grundstücke ggf. aus Titel/Beschreibung ableiten (TODO bei Land-Run).
    zoning:
      vertical === "land"
        ? /gradevinsk|građevinsk/i.test(`${raw.title ?? ""} ${raw.shortDescription ?? ""}`)
          ? "gradevinsko"
          : null
        : null,
    pricePerM2: vertical === "land" ? toNum(raw.pricePerSqm) : null,

    raw,
  };
}
