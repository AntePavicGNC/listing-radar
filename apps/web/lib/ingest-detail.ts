// Merge-Ingest für den njuskalo-detail-Actor: aktualisiert BESTEHENDE Inserate
// mit Detailseiten-Daten (alle Bilder, Baujahr, Zimmer, Ausstattung, volle
// Beschreibung) und rechnet den Score neu. Legt NIE neue Inserate an.
import { prisma } from "./prisma";
import { getDatasetItems } from "./apify";
import { makeId } from "./normalize/njuskalo";
import { normalizeNjuskaloDetail, type NjuskaloDetailItem } from "./normalize/njuskalo-detail";
import { computeScore, type Scorable } from "./score";
import { getEffectiveSettings } from "./settings";

export interface DetailIngestResult {
  fetched: number;
  merged: number;
  notFound: number;
}

export async function ingestNjuskaloDetails(datasetId: string): Promise<DetailIngestResult> {
  const items = (await getDatasetItems(datasetId)) as unknown as NjuskaloDetailItem[];
  const { weights } = await getEffectiveSettings();

  let merged = 0;
  let notFound = 0;

  for (const raw of items) {
    const d = normalizeNjuskaloDetail(raw);
    if (!d) continue;

    const id = makeId("njuskalo", d.adId);
    const existing = await prisma.listing.findUnique({ where: { id } });
    if (!existing) {
      notFound++;
      continue;
    }

    // Detailseite ist die bessere Quelle: Felder übernehmen, wenn vorhanden;
    // sonst bestehende Werte behalten. Bilder nur ersetzen, wenn MEHR da sind.
    const images = d.images.length > existing.images.length ? d.images : existing.images;
    const description =
      d.description && d.description.length > (existing.description?.length ?? 0)
        ? d.description
        : existing.description;

    const mergedFields = {
      images,
      description,
      areaLivingM2: d.areaLivingM2 ?? existing.areaLivingM2,
      areaPlotM2: d.areaPlotM2 ?? existing.areaPlotM2,
      rooms: d.rooms ?? existing.rooms,
      bathroomCount: d.bathroomCount ?? existing.bathroomCount,
      yearBuilt: d.yearBuilt ?? existing.yearBuilt,
      yearRenovated: d.yearRenovated ?? existing.yearRenovated,
      heatingType: d.heatingType ?? existing.heatingType,
      hasPool: d.hasPool ?? existing.hasPool,
      hasGarden: d.hasGarden ?? existing.hasGarden,
      hasGarage: d.hasGarage ?? existing.hasGarage,
      hasParkingSpot: d.hasParkingSpot ?? existing.hasParkingSpot,
      hasAirConditioning: d.hasAirConditioning ?? existing.hasAirConditioning,
      hasAuxiliaryBuilding: d.hasAuxiliaryBuilding ?? existing.hasAuxiliaryBuilding,
      hasSeaViewLikely: existing.hasSeaViewLikely ?? d.hasSeaViewLikely,
    };

    // €/m² mit den (ggf. neuen) Flächen ableiten
    const price = existing.displayPriceEur ?? existing.priceEur;
    const pricePerLivingM2 =
      existing.vertical === "house" && mergedFields.areaLivingM2 && mergedFields.areaLivingM2 > 0
        ? Math.round((price / mergedFields.areaLivingM2) * 100) / 100
        : existing.pricePerLivingM2;
    const pricePerPlotM2 =
      existing.vertical === "house" && mergedFields.areaPlotM2 && mergedFields.areaPlotM2 > 0
        ? Math.round((price / mergedFields.areaPlotM2) * 100) / 100
        : existing.pricePerPlotM2;
    const pricePerM2 =
      existing.vertical === "land" && mergedFields.areaPlotM2 && mergedFields.areaPlotM2 > 0
        ? Math.round((price / mergedFields.areaPlotM2) * 100) / 100
        : existing.pricePerM2;

    // Score mit den zusammengeführten Daten neu berechnen
    const scorable = {
      ...existing,
      ...mergedFields,
      pricePerLivingM2,
      pricePerPlotM2,
      pricePerM2,
    } as unknown as Scorable;
    const s = computeScore(scorable, weights);

    await prisma.listing.update({
      where: { id },
      data: {
        ...mergedFields,
        pricePerLivingM2,
        pricePerPlotM2,
        pricePerM2,
        score: s.score,
        scoreBreakdown: s.breakdown as unknown as object[],
        locationScore: s.locationScore,
        detailScrapedAt: new Date(),
      },
    });
    merged++;
  }

  return { fetched: items.length, merged, notFound };
}
