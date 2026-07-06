import Link from "next/link";
import { prisma } from "@/lib/prisma";

// Landing liest Live-Zähler aus der DB -> niemals statisch vorberechnen.
export const dynamic = "force-dynamic";

async function getCounts() {
  try {
    const [land, houses, cars] = await Promise.all([
      prisma.listing.count({ where: { vertical: "land", status: "active" } }),
      prisma.listing.count({ where: { vertical: "house", status: "active" } }),
      prisma.listing.count({ where: { vertical: "car", status: "active" } }),
    ]);
    return { ok: true as const, land, houses, cars };
  } catch {
    return { ok: false as const, land: 0, houses: 0, cars: 0 };
  }
}

function Tile({
  href,
  title,
  subtitle,
  count,
  big = false,
}: {
  href: string;
  title: string;
  subtitle: string;
  count: number;
  big?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col justify-between rounded-2xl bg-card p-6 ring-1 ring-foreground/10 transition-all duration-300 hover:-translate-y-1 hover:ring-foreground/20 hover:shadow-[0_22px_48px_-28px_oklch(0.24_0.012_60/0.55)] ${
        big ? "sm:col-span-2 sm:p-8" : ""
      }`}
    >
      <div>
        <h2 className={`font-heading tracking-tight ${big ? "text-4xl" : "text-2xl"}`}>{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="mt-6 flex items-baseline justify-between">
        <span className="font-heading text-3xl tabular-nums">{count}</span>
        <span className="text-xs uppercase tracking-wider text-muted-foreground group-hover:text-primary">
          aktive Inserate →
        </span>
      </div>
    </Link>
  );
}

export default async function Home() {
  const c = await getCounts();

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-16">
      <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
        Privater Inserate-Radar
      </p>
      <h1 className="mt-3 font-heading text-6xl tracking-tight">Listing Radar</h1>
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">
        Häuser &amp; Grundstücke rund um Zadar und Autos in Deutschland — gescrapt, vereinheitlicht,
        bewertet. Ein Score pro Inserat, mit Begründung.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Tile
          href="/land"
          title="Grundstücke"
          subtitle="Baugrund Umgebung Zadar — wichtigster Anwendungsfall, beste Treffer zuerst."
          count={c.land}
          big
        />
        <Tile href="/houses" title="Häuser" subtitle="80+ m², 100–400k €, Allowlist-Orte." count={c.houses} />
        <Tile href="/cars" title="Autos" subtitle="Automatik, EZ 2023+, um Ismaning." count={c.cars} />
      </div>

      {!c.ok ? (
        <p className="mt-6 text-xs text-destructive">
          Datenbank nicht erreichbar — Zähler zeigen 0. <code className="font-mono">/api/health</code> prüfen.
        </p>
      ) : null}
    </main>
  );
}
