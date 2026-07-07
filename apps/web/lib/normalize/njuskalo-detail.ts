// Normalizer für den eigenen njuskalo-detail-Actor: mappt die generisch
// gescrapten dt/dd-Paare ("Osnovni podaci") + Ausstattungslisten auf unsere
// Felder. Kroatische Begriffe, tolerant gegen Formatierung ("190,00 m²").
export interface NjuskaloDetailItem {
  adId: string | null;
  detailUrl: string;
  title?: string;
  specs?: Record<string, string>;
  images?: string[];
  description?: string;
  features?: string[];
  priceText?: string;
  jsonLd?: unknown[];
}

export interface DetailFields {
  adId: string;
  images: string[];
  description: string | null;
  areaLivingM2: number | null;
  areaPlotM2: number | null;
  rooms: number | null;
  bathroomCount: number | null;
  yearBuilt: number | null;
  yearRenovated: number | null;
  heatingType: string | null;
  hasPool: boolean | null;
  hasGarden: boolean | null;
  hasGarage: boolean | null;
  hasParkingSpot: boolean | null;
  hasAirConditioning: boolean | null;
  hasAuxiliaryBuilding: boolean | null;
  hasSeaViewLikely: boolean | null;
}

function num(s: string | undefined): number | null {
  if (!s) return null;
  // "1.234,56 m²" -> 1234.56 ; "190 m2" -> 190
  const m = /([\d.,]+)/.exec(s.replace(/\s/g, ""));
  if (!m) return null;
  let t = m[1];
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.includes(",")) t = t.replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function year(s: string | undefined): number | null {
  const m = /(19\d{2}|20\d{2})/.exec(s ?? "");
  return m ? parseInt(m[1], 10) : null;
}

/** Ersten spec-Wert finden, dessen Key auf eines der Muster passt. */
function spec(specs: Record<string, string>, ...patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    for (const [k, v] of Object.entries(specs)) if (re.test(k)) return v;
  }
  return undefined;
}

function hasFeature(features: string[], re: RegExp): boolean | null {
  return features.some((f) => re.test(f)) ? true : null;
}

/**
 * Galerie-Bilder aus dem Rohscrape: nur große Varianten (w920x690/xlsize),
 * per slika-ID dedupliziert. Kleine Varianten (360x360c, 80x60) sind Thumbnails
 * bzw. "ähnliche Anzeigen" und fliegen raus.
 */
function galleryImages(urls: string[]): string[] {
  const large = urls.filter((u) => /image-(w920x690|xlsize|original)/.test(u));
  const seen = new Set<string>();
  const out: string[] = [];
  // xlsize bevorzugen, dann w920x690 (gleiche slika-ID = gleiches Bild)
  for (const u of [...large].sort((a, b) => Number(b.includes("xlsize")) - Number(a.includes("xlsize")))) {
    const id = /slika-(\d+)/.exec(u)?.[1] ?? u;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(u);
  }
  return out.length > 0 ? out : urls.filter((u) => /^https?:\/\//.test(u)).slice(0, 30);
}

export function normalizeNjuskaloDetail(raw: NjuskaloDetailItem): DetailFields | null {
  const adId = raw.adId ?? /oglas-(\d{5,})/.exec(raw.detailUrl ?? "")?.[1] ?? null;
  if (!adId) return null;
  const specs = raw.specs ?? {};
  const features = raw.features ?? [];
  const featureText = features.join(" | ");

  return {
    adId,
    images: galleryImages(raw.images ?? []),
    description: raw.description?.trim() || null,
    areaLivingM2: num(spec(specs, /stamben[a-z]* povr[šs]in/i, /povr[šs]ina stana/i)),
    areaPlotM2: num(spec(specs, /povr[šs]ina oku[ćc]nic/i, /povr[šs]ina zemlji[šs]t/i, /povr[šs]ina vrta/i)),
    rooms: num(spec(specs, /broj soba/i)),
    bathroomCount: num(spec(specs, /broj kupaonic/i)),
    yearBuilt: year(spec(specs, /godina izgradnje/i, /godina gradnje/i)),
    yearRenovated: year(spec(specs, /adaptacij/i, /renovacij/i)),
    heatingType: spec(specs, /grijanje/i) ?? null,
    hasPool: hasFeature(features, /bazen/i),
    hasGarden: hasFeature(features, /\bvrt\b|oku[ćc]nica/i),
    hasGarage: hasFeature(features, /gara[žz]/i),
    hasParkingSpot: hasFeature(features, /parkir|parking/i),
    hasAirConditioning: hasFeature(features, /klima/i),
    hasAuxiliaryBuilding: hasFeature(features, /pomo[ćc]ni objekt|ljetna kuhinja|gostinjska/i),
    hasSeaViewLikely: /pogled na more/i.test(featureText) ? true : null,
  };
}
