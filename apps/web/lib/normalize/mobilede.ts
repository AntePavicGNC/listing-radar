// Normalizer für den Apify-Actor memo23/mobile-de-scraper.
// Kernfelder liegen teils flach (title, url, price, make, model, features),
// Details als attributes-Liste [{label, tag, value}]; per Test-Run verifiziert.
import type { NormalizedListing } from "./types";
import { distanceFromIsmaningKm } from "../geo";
import {
  makeId,
  toInt,
  detectAcc,
  detectParkingCamera,
  mapFuel,
  mapBodyType,
  stripHtml,
} from "./car-common";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function attr(raw: Any, tag: string): string | null {
  const hit = (raw.attributes ?? []).find((a: Any) => a?.tag === tag);
  return hit?.value != null ? String(hit.value) : null;
}

/** Sucht einen Attribut-Wert über mehrere mögliche Tags/Label-Fragmente. */
function attrLike(raw: Any, fragments: string[]): string | null {
  const hit = (raw.attributes ?? []).find((a: Any) => {
    const key = `${a?.tag ?? ""} ${a?.label ?? ""}`.toLowerCase();
    return fragments.some((f) => key.includes(f));
  });
  return hit?.value != null ? String(hit.value) : null;
}

export function normalizeMobilede(raw: Any): NormalizedListing | null {
  const id = raw?.id != null ? String(raw.id) : "";
  if (!id) return null;

  const price = raw?.price?.grs?.amount ?? null;
  if (price == null) return null;

  const images: string[] = (raw.images ?? [])
    .map((img: Any) => (img?.uri ? `https://${img.uri}?rule=mo-1024.jpg` : null))
    .filter(Boolean);

  // Erstzulassung "06/2024"
  const fr = attrLike(raw, ["firstregistration", "first registration", "erstzulassung"]);
  const frMatch = fr?.match(/(\d{2})\/(\d{4})/);

  const mileage = toInt(attrLike(raw, ["mileage", "kilometer"]));
  const powerText = attrLike(raw, ["power", "leistung"]) ?? "";
  const psMatch = powerText.match(/\((\d+)\s*(?:PS|hp)\)/i);
  const kwMatch = powerText.match(/(\d+)\s*kW/i);
  const powerPs = psMatch ? Number(psMatch[1]) : kwMatch ? Math.round(Number(kwMatch[1]) * 1.36) : null;

  const transText = attrLike(raw, ["transmission", "getriebe", "gearbox"]) ?? "";
  const fuelText = attrLike(raw, ["fuel", "kraftstoff"]) ?? "";
  const rangeText = attrLike(raw, ["range", "reichweite"]);

  const lat = raw?.contact?.latLong?.lat ?? null;
  const lng = raw?.contact?.latLong?.lon ?? null;
  // "DE-80935 München" -> PLZ + Stadt
  const addr: string = raw?.contact?.address2 ?? "";
  const addrMatch = addr.match(/(?:DE-)?(\d{5})\s+(.+)/);

  const description = stripHtml(raw.htmlDescription ?? null);
  const featureText = `${(raw.features ?? []).join(", ")} ${description ?? ""}`;

  return {
    id: makeId("mobilede", id),
    source: "mobilede",
    sourceListingId: id,
    vertical: "car",
    url: raw.url ?? `https://suchen.mobile.de/auto-inserat/${id}.html`,
    title: raw.title ?? raw.shortTitle ?? "Auto",
    priceEur: Math.round(price),
    images,
    description:
      raw.isDamageCase === true ? `[Unfall-/Schadensfall laut Inserat]\n${description ?? ""}` : description,
    locationRaw: addr || [raw?.contact?.name, raw?.contact?.country].filter(Boolean).join(", "),
    locationCity: addrMatch?.[2] ?? null,
    locationRegion: raw?.contact?.country ?? null,
    lat,
    lng,
    postedAt: raw.created ? new Date(raw.created) : null,

    make: raw?.make?.localized ?? null,
    model: raw?.model?.localized ?? null,
    variant: attrLike(raw, ["trimline", "trim line"]) ?? null,
    firstRegistrationYear: frMatch ? Number(frMatch[2]) : null,
    firstRegistrationMonth: frMatch ? Number(frMatch[1]) : null,
    mileageKm: mileage,
    fuel: mapFuel(fuelText),
    rangeKm: rangeText ? toInt(rangeText) : null,
    transmission: /automatic|automatik/i.test(transText)
      ? "automatic"
      : transText
        ? "manual"
        : null,
    powerPs,
    bodyType: mapBodyType(attrLike(raw, ["category", "kategorie"])),
    distanceFromIsmaningKm: distanceFromIsmaningKm(lat, lng) ?? null,
    hasAdaptiveCruiseControl: detectAcc(featureText),
    hasParkingCamera: detectParkingCamera(featureText),

    raw,
  };
}
