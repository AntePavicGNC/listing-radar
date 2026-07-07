import { NextResponse } from "next/server";
import { ingestDataset } from "@/lib/ingest";
import { ingestNjuskaloDetails } from "@/lib/ingest-detail";
import type { Source } from "@/lib/normalize/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Ingest darf bis zu 5 min laufen

const VALID_SOURCES: Source[] = ["njuskalo", "indexoglasi", "autoscout24", "mobilede", "autohero"];

// Apify-Webhook (oder manueller Trigger): nimmt source + datasetId entgegen,
// prüft das INGEST_SECRET und stößt die Pipeline an.
export async function POST(request: Request) {
  const url = new URL(request.url);

  const secret = url.searchParams.get("secret");
  if (!process.env.INGEST_SECRET || secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const source = url.searchParams.get("source") ?? "";
  // "njuskalo-detail" ist KEINE eigene Quelle: der Detail-Actor reichert
  // bestehende njuskalo-Inserate an (Merge statt Upsert, lib/ingest-detail.ts)
  if (source !== "njuskalo-detail" && !VALID_SOURCES.includes(source as Source)) {
    return NextResponse.json({ error: "invalid or missing source" }, { status: 400 });
  }

  // datasetId aus Query ODER aus dem Apify-Webhook-Body (resource.defaultDatasetId)
  let datasetId = url.searchParams.get("datasetId") ?? undefined;
  if (!datasetId) {
    try {
      const body = (await request.json()) as {
        resource?: { defaultDatasetId?: string };
        datasetId?: string;
      };
      datasetId = body?.resource?.defaultDatasetId ?? body?.datasetId;
    } catch {
      // kein/ungültiger Body
    }
  }
  if (!datasetId) {
    return NextResponse.json({ error: "missing datasetId" }, { status: 400 });
  }

  try {
    const result =
      source === "njuskalo-detail"
        ? await ingestNjuskaloDetails(datasetId)
        : await ingestDataset(source as Source, datasetId);
    return NextResponse.json({ ok: true, source, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
