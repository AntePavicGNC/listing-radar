import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

// Landing prüft die DB-Verbindung zur Laufzeit -> niemals statisch vorberechnen
// (sonst Build-Fehler/DB-Zugriff ohne gesetzte DATABASE_URL).
export const dynamic = "force-dynamic";

async function getDbStatus(): Promise<{ ok: boolean; message?: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export default async function Home() {
  const db = await getDbStatus();

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Listing Radar</CardTitle>
          <CardDescription>
            Häuser &amp; Grundstücke (Zadar) und Autos (DE) — privat, an einem Ort.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Datenbank:</span>
            {db.ok ? (
              <span className="font-medium text-emerald-600">verbunden ✓</span>
            ) : (
              <span className="text-destructive font-medium">nicht verbunden</span>
            )}
          </div>
          {!db.ok && (
            <p className="text-muted-foreground text-xs">
              Sobald <code className="font-mono">DATABASE_URL</code> in{" "}
              <code className="font-mono">apps/web/.env</code> gesetzt ist, steht hier „verbunden".
            </p>
          )}
          <div className="flex items-center gap-3 pt-1">
            <Button>Meilenstein 1 läuft</Button>
            <a
              href="/api/health"
              className="text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground"
            >
              /api/health
            </a>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
