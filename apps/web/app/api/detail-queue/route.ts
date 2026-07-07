import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Liefert dem njuskalo-detail-Actor die Detailseiten, die sich lohnen:
// aktive Njuskalo-Inserate, denen Detail-Daten fehlen (kaum Bilder oder kein
// Baujahr/Zimmer), beste Scores zuerst. Secret-gated wie /api/ingest.
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!process.env.INGEST_SECRET || url.searchParams.get("secret") !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 300);

  const rows = await prisma.listing.findMany({
    where: {
      source: "njuskalo",
      status: "active",
      // Noch nie detail-gescrapt; die Suchliste liefert nur 1 Bild und
      // meist kein Baujahr/Zimmer — Details lohnen sich praktisch immer.
      detailScrapedAt: null,
    },
    orderBy: { score: "desc" },
    take: limit,
    select: { url: true },
  });

  return NextResponse.json({ items: rows.map((r) => ({ url: r.url })) });
}
