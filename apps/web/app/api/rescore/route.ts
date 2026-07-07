import { NextResponse } from "next/server";
import { rescoreAll } from "@/lib/rescore";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Secret-gated wie /api/ingest; Logik in lib/rescore.ts (auch von /settings genutzt).
export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!process.env.INGEST_SECRET || url.searchParams.get("secret") !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await rescoreAll();
  return NextResponse.json({ ok: true, ...result });
}
