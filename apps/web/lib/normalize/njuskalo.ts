// Normalizer für den Apify-Actor logiover/njuskalo-hr-property-scraper.
// Feldnamen wurden per echtem Test-Run verifiziert (SPEC §4/§7).
import { createHash } from "node:crypto";
import type { NormalizedListing } from "./types";
import { extractAreas, extractRooms, extractYearBuilt } from "./text-extract";

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

/** Rohbau/unfertig aus Titel/Beschreibung erkennen (Feedback Ante 07/2026). */
function detectUnfinished(text: string): boolean {
  return /roh[\s-]?bau|nedovr[šs]en|u\s+izgradnji|siva\s+faza|visoki\s+roh|nezavr[šs]en|unfertig|im\s+bau/i.test(
    text,
  );
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
  const text = `${raw.title ?? ""} ${raw.shortDescription ?? ""}`;
  // Fallback: Flächen/Zimmer/Baujahr aus dem Text ziehen, wenn der Actor sie
  // nicht liefert (Actor-Werte haben immer Vorrang vor Text-Extraktion)
  const fromText = extractAreas(text);
  const actorArea = toNum(raw.areaSqm); // bei Land = Grundstücksfläche
  const actorPlot = toNum(raw.terrainAreaSqm);
  const areaLiving =
    vertical === "house" ? (actorArea ?? fromText.living ?? fromText.any) : null;
  const areaPlot =
    vertical === "land"
      ? (actorPlot ?? actorArea ?? fromText.plot ?? fromText.any)
      : (actorPlot ?? fromText.plot);
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

    areaLivingM2: areaLiving,
    areaPlotM2: areaPlot,
    rooms: toNum(raw.rooms) ?? (vertical === "house" ? extractRooms(text) : null),
    yearBuilt: toNum(raw.yearBuilt) ?? (vertical === "house" ? extractYearBuilt(text) : null),
    yearRenovated: null,
    // Rohbau/unfertig = starker Renovierungsbedarf (klarer Score-Abzug)
    renovationNeeded:
      vertical === "house" &&
      detectUnfinished(`${raw.title ?? ""} ${raw.shortDescription ?? ""}`)
        ? "heavy"
        : null,
    // Njuskalo liefert kein explizites Garten-Feld; Grundstücksfläche als Heuristik.
    hasGarden: areaPlot != null && areaPlot > 0 ? true : null,
    // Immer ableiten, wenn das Portal es nicht liefert (Entscheidungsgrundlage!)
    pricePerLivingM2:
      vertical === "house"
        ? (toNum(raw.pricePerSqm) ??
          (areaLiving != null && areaLiving > 0 && price > 0
            ? Math.round((price / areaLiving) * 100) / 100
            : null))
        : null,
    pricePerPlotM2:
      vertical === "house" && areaPlot != null && areaPlot > 0
        ? Math.round((price / areaPlot) * 100) / 100
        : null,
    ...(vertical === "land"
      ? detectZoning(`${raw.title ?? ""} ${raw.shortDescription ?? ""}`)
      : { zoningStated: null, zoningConfirmedBuildingLand: null }),
    // Actor liefert pricePerSqm bei Land oft nicht -> aus Preis/Fläche ableiten
    pricePerM2:
      vertical === "land"
        ? (toNum(raw.pricePerSqm) ??
          (areaPlot != null && areaPlot > 0 && price > 0
            ? Math.round((price / areaPlot) * 100) / 100
            : null))
        : null,

    raw,
  };
}
