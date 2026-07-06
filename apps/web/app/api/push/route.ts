import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Public VAPID-Key für den Client (vermeidet NEXT_PUBLIC-Build-Abhängigkeit). */
export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return NextResponse.json({ error: "VAPID_PUBLIC_KEY fehlt" }, { status: 503 });
  return NextResponse.json({ publicKey: key });
}

/** Push-Abo speichern (pro Gerät/Browser, ohne Login — SPEC §9). */
export async function POST(request: Request) {
  try {
    const sub = (await request.json()) as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      return NextResponse.json({ error: "Ungültiges Abo" }, { status: 400 });
    }
    await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      update: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** Abo entfernen (z. B. wenn der Browser abbestellt). */
export async function DELETE(request: Request) {
  const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: "endpoint fehlt" }, { status: 400 });
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  return NextResponse.json({ ok: true });
}
