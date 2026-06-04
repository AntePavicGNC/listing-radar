// Ingest-Pipeline (SPEC §7): Dataset -> normalisieren -> Hard-Filter -> Scoren
// -> Dedupe-Key -> Upsert in Postgres -> Preisverlauf pflegen.
import { prisma } from "./prisma";
import { getDatasetItems } from "./apify";
import { normalizeItem } from "./normalize";
import { passesHardFilter } from "./filters";
import { computeScore } from "./score";
import { dedupeKey } from "./dedupe";
import type { NormalizedListing, Source } from "./normalize/types";

export interface IngestResult {
  source: Source;
  fetched: number;
  passed: number;
  upserted: number;
  priceChanges: number;
}

function commonFields(n: NormalizedListing, score: number, key: string, now: Date) {
  return {
    url: n.url,
    title: n.title,
    priceEur: n.priceEur,
    images: n.images,
    description: n.description ?? null,
    locationRaw: n.locationRaw,
    locationCity: n.locationCity ?? null,
    locationRegion: n.locationRegion ?? null,
    lat: n.lat ?? null,
    lng: n.lng ?? null,
    postedAt: n.postedAt ?? null,
    lastSeenAt: now,
    status: "active" as const,
    score,
    dedupeKey: key,
    areaLivingM2: n.areaLivingM2 ?? null,
    areaPlotM2: n.areaPlotM2 ?? null,
    rooms: n.rooms ?? null,
    yearBuilt: n.yearBuilt ?? null,
    yearRenovated: n.yearRenovated ?? null,
    hasGarden: n.hasGarden ?? null,
    pricePerLivingM2: n.pricePerLivingM2 ?? null,
    zoning: n.zoning ?? null,
    pricePerM2: n.pricePerM2 ?? null,
    make: n.make ?? null,
    model: n.model ?? null,
    variant: n.variant ?? null,
    firstRegistrationYear: n.firstRegistrationYear ?? null,
    firstRegistrationMonth: n.firstRegistrationMonth ?? null,
    mileageKm: n.mileageKm ?? null,
    fuel: n.fuel ?? null,
    transmission: n.transmission ?? null,
    powerPs: n.powerPs ?? null,
    bodyType: n.bodyType ?? null,
    distanceFromIsmaningKm: n.distanceFromIsmaningKm ?? null,
    raw: (n.raw ?? null) as object,
  };
}

export async function ingestDataset(source: Source, datasetId: string): Promise<IngestResult> {
  const items = await getDatasetItems(datasetId);
  let passed = 0;
  let upserted = 0;
  let priceChanges = 0;

  for (const raw of items) {
    const n = normalizeItem(source, raw);
    if (!n || !passesHardFilter(n)) continue;
    passed++;

    const score = computeScore({
      vertical: n.vertical,
      priceEur: n.priceEur,
      rooms: n.rooms,
      hasGarden: n.hasGarden,
      yearBuilt: n.yearBuilt,
      yearRenovated: n.yearRenovated,
      pricePerLivingM2: n.pricePerLivingM2,
      pricePerM2: n.pricePerM2,
      aiImageScore: null,
      mileageKm: n.mileageKm,
      firstRegistrationYear: n.firstRegistrationYear,
      fuel: n.fuel,
      make: n.make,
      bodyType: n.bodyType,
    });
    const key = dedupeKey(n);
    const now = new Date();

    const existing = await prisma.listing.findUnique({
      where: { id: n.id },
      select: { priceEur: true },
    });

    const fields = commonFields(n, score, key, now);
    await prisma.listing.upsert({
      where: { id: n.id },
      create: {
        id: n.id,
        source: n.source,
        sourceListingId: n.sourceListingId,
        vertical: n.vertical,
        firstSeenAt: now,
        ...fields,
      },
      update: fields,
    });
    upserted++;

    // Preisverlauf: erste Sichtung ODER Preisänderung protokollieren.
    if (!existing || existing.priceEur !== n.priceEur) {
      await prisma.priceHistory.create({
        data: { listingId: n.id, priceEur: n.priceEur, date: now },
      });
      if (existing) priceChanges++;
    }
  }

  return { source, fetched: items.length, passed, upserted, priceChanges };
}
