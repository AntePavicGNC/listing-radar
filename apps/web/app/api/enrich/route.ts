import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reviewListingImages } from "@/lib/ai/image-review";
import { computeScore, type Scorable } from "@/lib/score";
import { listImage } from "@/components/listing-bits";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CONCURRENCY = 3;
const DEFAULT_LIMIT = 40; // pro Aufruf (passt in maxDuration); mehrfach aufrufen bis remaining=0

// KI-Bildbewertung (SPEC §9): bewertet unbewertete Häuser/Grundstücke (nur solche,
// die die Hard-Filter bestanden haben — andere stehen nicht in der DB), schreibt
// aiImageScore/Notes + hasSeaViewLikely/looksLikeTouristRental/renovationNeeded
// und berechnet Score + Breakdown neu. Secret-gated wie /api/ingest.
export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!process.env.INGEST_SECRET || url.searchParams.get("secret") !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY ist nicht gesetzt." }, { status: 503 });
  }

  const limit = Math.min(Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT), 100);

  // Fehlgeschlagene nicht endlos wiederholen (⚠-Marker in aiImageNotes).
  // OR mit null nötig: SQL-NOT-LIKE filtert NULL-Werte sonst mit raus.
  const pendingWhere = {
    vertical: { in: ["house", "land"] as ("house" | "land")[] },
    status: "active" as const,
    aiImageScore: null,
    OR: [{ aiImageNotes: null }, { NOT: { aiImageNotes: { startsWith: "⚠" } } }],
  };

  const pending = await prisma.listing.findMany({
    where: pendingWhere,
    orderBy: { firstSeenAt: "desc" },
    take: limit,
  });

  let reviewed = 0;
  let skippedNoImages = 0;
  let failed = 0;

  const queue = [...pending];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const l = queue.shift();
      if (!l) return;

      const imageUrls = l.images.map((u) => listImage(u)).filter(Boolean) as string[];
      if (imageUrls.length === 0) {
        // Ohne Bilder nicht bewertbar (z. B. Index Oglasi) — markieren, nicht wiederholen
        await prisma.listing.update({
          where: { id: l.id },
          data: { aiImageNotes: "⚠ Keine Bilder verfügbar — nicht bewertbar." },
        });
        skippedNoImages++;
        continue;
      }

      try {
        const review = await reviewListingImages({
          vertical: l.vertical as "house" | "land",
          title: l.title,
          description: l.description,
          imageUrls,
        });

        // Score + Breakdown mit den neuen KI-Signalen neu berechnen
        const scorable = {
          ...l,
          aiImageScore: review.aiImageScore,
          hasSeaViewLikely: review.hasSeaViewLikely,
          looksLikeTouristRental: review.looksLikeTouristRental,
          renovationNeeded: review.renovationNeeded === "unknown" ? null : review.renovationNeeded,
        } as unknown as Scorable;
        const s = computeScore(scorable);

        await prisma.listing.update({
          where: { id: l.id },
          data: {
            aiImageScore: review.aiImageScore,
            aiImageNotes: review.aiImageNotes,
            hasSeaViewLikely: review.hasSeaViewLikely,
            looksLikeTouristRental: review.looksLikeTouristRental,
            renovationNeeded: review.renovationNeeded === "unknown" ? null : review.renovationNeeded,
            score: s.score,
            scoreBreakdown: s.breakdown as unknown as object[],
          },
        });
        reviewed++;
      } catch (e) {
        failed++;
        await prisma.listing
          .update({
            where: { id: l.id },
            data: {
              aiImageNotes: `⚠ Bewertung fehlgeschlagen: ${e instanceof Error ? e.message.slice(0, 180) : String(e)}`,
            },
          })
          .catch(() => {});
      }
    }
  });
  await Promise.all(workers);

  const remaining = await prisma.listing.count({ where: pendingWhere });

  return NextResponse.json({ ok: true, reviewed, skippedNoImages, failed, remaining });
}
