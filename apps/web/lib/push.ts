// Web-Push-Versand (SPEC §9): nach erfolgreichem Ingest bei neuen Treffern
// und Preissenkungen. Abos liegen in PushSubscription (pro Gerät).
import webpush from "web-push";
import { prisma } from "./prisma";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

function configured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Schickt eine Nachricht an ALLE Abos; abgelaufene Abos werden aufgeräumt. */
export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; removed: number }> {
  if (!configured()) return { sent: 0, removed: 0 };
  webpush.setVapidDetails(
    `mailto:${process.env.PUSH_CONTACT_EMAIL ?? "listing-radar@example.com"}`,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const subs = await prisma.pushSubscription.findMany();
  let sent = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
        sent++;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Abo abgelaufen/abbestellt -> entfernen
          await prisma.pushSubscription.delete({ where: { endpoint: s.endpoint } }).catch(() => {});
          removed++;
        }
      }
    }),
  );
  return { sent, removed };
}
