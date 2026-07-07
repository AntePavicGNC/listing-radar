// Normalizer für den Apify-Actor memo23/autoscout24-scraper.
// Output ist AS24-GraphQL-Form (ListingDetails); Felder per Test-Run verifiziert.
import type { NormalizedListing } from "./types";
import { distanceFromIsmaningKm } from "../geo";
import {
  makeId,
  detectAcc,
  detectParkingCamera,
  mapFuel,
  mapBodyType,
  correctBodyType,
  stripHtml,
} from "./car-common";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Lesbaren Titel aus dem webPage-Slug bauen ("smart-1-premium-...-<guid>"). */
function titleFromSlug(webPage: string | undefined, fallback: string): string {
  if (!webPage) return fallback;
  const slug = webPage.split("/").pop() ?? "";
  const words = slug
    .replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "")
    .split("-")
    .filter(Boolean);
  if (words.length === 0) return fallback;
  return words.map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase())).join(" ");
}

export function normalizeAutoscout24(raw: Any): NormalizedListing | null {
  const id = raw?.identifier?.id ? String(raw.identifier.id) : "";
  if (!id) return null;

  const v = raw.vehicle ?? {};
  const cls = v.classification ?? {};
  const make = cls.make?.formatted ?? null;
  const model = cls.model?.formatted ?? null;

  const price = raw?.prices?.public?.amountInEUR?.raw ?? null;
  if (price == null) return null;

  const images: string[] = (raw?.media?.images ?? [])
    .map((img: Any) => img?.formats?.jpg?.size800x600 ?? img?.formats?.jpg?.size420x315)
    .filter(Boolean);

  const firstReg: string | null = v.condition?.firstRegistrationDate?.raw ?? null; // "2024-06-01"
  const lat = raw?.location?.latitude ?? null;
  const lng = raw?.location?.longitude ?? null;

  const description = stripHtml(raw?.description ?? null);
  // Ausstattung: AS24 liefert equipment verschachtelt -> als Text durchsuchen (tolerant)
  const equipmentText = `${JSON.stringify(raw?.vehicle?.equipment ?? "")} ${description ?? ""}`;

  const fuelText: string = v.fuels?.fuelCategory?.formatted ?? v.fuels?.primary?.type?.formatted ?? "";
  const accidentFree: boolean | null = v.condition?.damage?.accidentFree ?? null;

  return {
    id: makeId("autoscout24", id),
    source: "autoscout24",
    sourceListingId: id,
    vertical: "car",
    url: raw.webPage ?? `https://www.autoscout24.de/angebote/${id}`,
    title: titleFromSlug(raw.webPage, [make, model].filter(Boolean).join(" ") || "Auto"),
    priceEur: Math.round(price),
    images,
    // Unfall-Angabe sichtbar in die Beschreibung heben (fließt in Score-Erkennung ein)
    description:
      accidentFree === false ? `[Nicht unfallfrei laut Inserat]\n${description ?? ""}` : description,
    locationRaw: [raw?.location?.zip, raw?.location?.city, raw?.location?.countryCode]
      .filter(Boolean)
      .join(", "),
    locationCity: raw?.location?.city ?? null,
    locationRegion: raw?.location?.countryCode ?? null,
    lat,
    lng,
    postedAt: raw?.publication?.createdTimestampWithOffset
      ? new Date(raw.publication.createdTimestampWithOffset)
      : null,

    make,
    model,
    variant: null,
    firstRegistrationYear: firstReg ? Number(firstReg.slice(0, 4)) : null,
    firstRegistrationMonth: firstReg ? Number(firstReg.slice(5, 7)) : null,
    mileageKm: v.condition?.mileageInKm?.raw ?? null,
    fuel: mapFuel(fuelText),
    rangeKm: v.fuels?.electricRangeWithFallback?.raw ?? null,
    transmission:
      v.engine?.transmissionType?.raw === "Automatic"
        ? "automatic"
        : v.engine?.transmissionType?.raw
          ? "manual"
          : null,
    powerPs: v.engine?.power?.hp?.raw ?? null,
    bodyType: correctBodyType(mapBodyType(v.bodyType?.raw ?? v.bodyType?.formatted), model, raw.webPage),
    distanceFromIsmaningKm: distanceFromIsmaningKm(lat, lng) ?? null,
    hasAdaptiveCruiseControl: detectAcc(equipmentText),
    hasParkingCamera: detectParkingCamera(equipmentText),

    raw,
  };
}
