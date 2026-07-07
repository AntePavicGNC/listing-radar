// Re-normalisiert + re-scort alle Inserate aus dem gespeicherten `raw`-Datensatz.
// Nützlich nach Änderungen an Gewichten/Filtern (/settings), Normalizern oder
// Score-Logik, ohne neu zu scrapen. Genutzt von /api/rescore und /settings.
import { prisma } from "./prisma";
import { normalizeItem } from "./normalize";
import { applyPriceRules } from "./enrich";
import { passesHardFilter } from "./filters";
import { computeScore } from "./score";
import { dedupeKey } from "./dedupe";
import { commonFields } from "./ingest";
import { getEffectiveSettings } from "./settings";
import type { Source } from "./normalize/types";

export interface RescoreResult {
  total: number;
  rescored: number;
  dropped: number; // besteht die (neuen) Hard-Filter nicht mehr -> status gone
  revived: number; // war "gone", besteht die (neuen) Filter jetzt wieder
}

export async function rescoreAll(): Promise<RescoreResult> {
  const { weights, filters } = await getEffectiveSettings();

  const listings = await prisma.listing.findMany({
    select: {
      id: true,
      source: true,
      status: true,
      raw: true,
      // KI-Anreicherung bleibt beim Rescore erhalten (kommt nicht aus raw)
      aiImageScore: true,
      hasSeaViewLikely: true,
      looksLikeTouristRental: true,
      renovationNeeded: true,
    },
  });

  let rescored = 0;
  let dropped = 0;
  let revived = 0;
  for (const row of listings) {
    if (row.raw == null) continue;
    const normalized = normalizeItem(row.source as Source, row.raw);
    if (!normalized) continue;
    // KI-Felder in das normalisierte Objekt mergen (KI hat Vorrang, sonst
    // regelbasierte Erkennung aus dem Normalizer, z. B. Rohbau -> heavy)
    const enriched = applyPriceRules(normalized);
    const n = {
      ...enriched,
      hasSeaViewLikely: row.hasSeaViewLikely ?? enriched.hasSeaViewLikely,
      looksLikeTouristRental: row.looksLikeTouristRental ?? enriched.looksLikeTouristRental,
      renovationNeeded: row.renovationNeeded ?? enriched.renovationNeeded,
    };

    if (!passesHardFilter(n, filters)) {
      if (row.status === "active") {
        await prisma.listing.update({ where: { id: row.id }, data: { status: "gone" } });
        dropped++;
      }
      continue;
    }
    if (row.status === "gone") revived++;

    const s = computeScore({ ...n, aiImageScore: row.aiImageScore }, weights);
    const now = new Date();
    const fields = commonFields(n, s, dedupeKey(n), now);
    // lastSeenAt nicht künstlich auffrischen — Rescore ist kein neuer Scrape
    const { lastSeenAt: _lastSeenAt, ...rest } = fields;
    await prisma.listing.update({
      where: { id: row.id },
      data: { ...rest, status: "active" },
    });
    rescored++;
  }

  return { total: listings.length, rescored, dropped, revived };
}
