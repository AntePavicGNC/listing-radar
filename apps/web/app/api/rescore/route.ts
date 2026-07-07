import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeItem } from "@/lib/normalize";
import { applyPriceRules } from "@/lib/enrich";
import { passesHardFilter } from "@/lib/filters";
import { computeScore } from "@/lib/score";
import { dedupeKey } from "@/lib/dedupe";
import { commonFields } from "@/lib/ingest";
import type { Source } from "@/lib/normalize/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Re-normalisiert + re-scort alle Inserate aus dem gespeicherten `raw`-Datensatz.
// Nützlich nach Änderungen an Gewichten (config.ts), Normalizern oder Score-Logik,
// ohne neu zu scrapen. Secret-gated wie /api/ingest.
export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!process.env.INGEST_SECRET || url.searchParams.get("secret") !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const listings = await prisma.listing.findMany({
    select: {
      id: true,
      source: true,
      raw: true,
      // KI-Anreicherung bleibt beim Rescore erhalten (kommt nicht aus raw)
      aiImageScore: true,
      hasSeaViewLikely: true,
      looksLikeTouristRental: true,
      renovationNeeded: true,
    },
  });

  let rescored = 0;
  let dropped = 0; // besteht die (neuen) Hard-Filter nicht mehr -> status gone
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

    if (!passesHardFilter(n)) {
      await prisma.listing.update({ where: { id: row.id }, data: { status: "gone" } });
      dropped++;
      continue;
    }

    const s = computeScore({ ...n, aiImageScore: row.aiImageScore });
    const now = new Date();
    const fields = commonFields(n, s, dedupeKey(n), now);
    // lastSeenAt nicht künstlich auffrischen — Rescore ist kein neuer Scrape
    const { lastSeenAt: _lastSeenAt, ...rest } = fields;
    await prisma.listing.update({ where: { id: row.id }, data: rest });
    rescored++;
  }

  return NextResponse.json({ ok: true, total: listings.length, rescored, dropped });
}
