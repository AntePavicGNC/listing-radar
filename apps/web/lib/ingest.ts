// Ingest-Pipeline (SPEC §7): Dataset -> normalisieren -> Hard-Filter -> Scoren
// -> Dedupe-Key -> Upsert in Postgres -> Preisverlauf pflegen.
import { prisma } from "./prisma";
import { getDatasetItems } from "./apify";
import { normalizeItem } from "./normalize";
import { applyPriceRules } from "./enrich";
import { passesHardFilter } from "./filters";
import { computeScore, type ScoreResult } from "./score";
import { sendPushToAll } from "./push";
import { dedupeKey } from "./dedupe";
import type { NormalizedListing, Source } from "./normalize/types";

export interface IngestResult {
  source: Source;
  fetched: number;
  passed: number;
  upserted: number;
  priceChanges: number;
}

export function commonFields(n: NormalizedListing, s: ScoreResult, key: string, now: Date) {
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
    score: s.score,
    // Cast nötig: Interface ohne Index-Signatur vs. Prismas InputJsonValue
    scoreBreakdown: s.breakdown as unknown as object[],
    locationScore: s.locationScore,
    dedupeKey: key,
    displayPriceEur: n.displayPriceEur ?? null,
    priceOnRequest: n.priceOnRequest ?? false,
    // Haus
    areaLivingM2: n.areaLivingM2 ?? null,
    areaPlotM2: n.areaPlotM2 ?? null,
    rooms: n.rooms ?? null,
    bathroomCount: n.bathroomCount ?? null,
    yearBuilt: n.yearBuilt ?? null,
    yearRenovated: n.yearRenovated ?? null,
    hasGarden: n.hasGarden ?? null,
    hasPool: n.hasPool ?? null,
    hasAuxiliaryBuilding: n.hasAuxiliaryBuilding ?? null,
    hasParkingSpot: n.hasParkingSpot ?? null,
    hasGarage: n.hasGarage ?? null,
    hasAirConditioning: n.hasAirConditioning ?? null,
    heatingType: n.heatingType ?? null,
    renovationNeeded: n.renovationNeeded ?? null,
    hasSeaViewLikely: n.hasSeaViewLikely ?? null,
    looksLikeTouristRental: n.looksLikeTouristRental ?? null,
    pricePerLivingM2: n.pricePerLivingM2 ?? null,
    pricePerPlotM2: n.pricePerPlotM2 ?? null,
    // Grundstück
    zoningStated: n.zoningStated ?? null,
    zoningConfirmedBuildingLand: n.zoningConfirmedBuildingLand ?? null,
    pricePerM2: n.pricePerM2 ?? null,
    // Auto
    make: n.make ?? null,
    model: n.model ?? null,
    variant: n.variant ?? null,
    firstRegistrationYear: n.firstRegistrationYear ?? null,
    firstRegistrationMonth: n.firstRegistrationMonth ?? null,
    mileageKm: n.mileageKm ?? null,
    fuel: n.fuel ?? null,
    rangeKm: n.rangeKm ?? null,
    transmission: n.transmission ?? null,
    powerPs: n.powerPs ?? null,
    bodyType: n.bodyType ?? null,
    distanceFromIsmaningKm: n.distanceFromIsmaningKm ?? null,
    hasAdaptiveCruiseControl: n.hasAdaptiveCruiseControl ?? null,
    hasParkingCamera: n.hasParkingCamera ?? null,
    infotainmentGeneration: n.infotainmentGeneration ?? null,
    monthlyFinancingEur: n.monthlyFinancingEur ?? null,
    raw: (n.raw ?? null) as object,
  };
}

export async function ingestDataset(source: Source, datasetId: string): Promise<IngestResult> {
  const items = await getDatasetItems(datasetId);
  let passed = 0;
  let upserted = 0;
  let priceChanges = 0;
  let newListings = 0;
  let priceDrops = 0;
  let firstVertical: string | null = null;

  for (const raw of items) {
    const normalized = normalizeItem(source, raw);
    if (!normalized) continue;
    // Fake-Preis / "Preis auf Anfrage" VOR Filter und Scoring auflösen (SPEC §9)
    const n = applyPriceRules(normalized);
    if (!passesHardFilter(n)) continue;
    passed++;

    const score = computeScore(n);
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

    firstVertical ??= n.vertical;
    if (!existing) newListings++;

    // Preisverlauf: erste Sichtung ODER Preisänderung protokollieren.
    if (!existing || existing.priceEur !== n.priceEur) {
      await prisma.priceHistory.create({
        data: { listingId: n.id, priceEur: n.priceEur, date: now },
      });
      if (existing) {
        priceChanges++;
        if (n.priceEur < existing.priceEur) priceDrops++;
      }
    }
  }

  // Push (SPEC §9): neue Treffer über den Hard-Filtern + Preissenkungen.
  if (newListings > 0 || priceDrops > 0) {
    const parts: string[] = [];
    if (newListings > 0) parts.push(`${newListings} neue Treffer`);
    if (priceDrops > 0) parts.push(`${priceDrops} Preissenkung${priceDrops > 1 ? "en" : ""}`);
    const url = firstVertical === "car" ? "/cars" : firstVertical === "land" ? "/land" : "/houses";
    await sendPushToAll({
      title: "Listing Radar",
      body: `${parts.join(" · ")} (${source})`,
      url,
    }).catch(() => {}); // Push-Fehler dürfen den Ingest nie brechen
  }

  return { source, fetched: items.length, passed, upserted, priceChanges };
}
