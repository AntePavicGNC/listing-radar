import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { LandCard } from "@/components/land-card";
import { SiteNav } from "@/components/site-nav";
import type { Prisma } from "@/lib/generated/prisma/client";

export const dynamic = "force-dynamic";

const SORTS = {
  score: { label: "Score", orderBy: [{ score: "desc" }, { firstSeenAt: "desc" }] },
  preis: { label: "Preis", orderBy: [{ priceEur: "asc" }] },
  qm: { label: "€/m²", orderBy: [{ pricePerM2: "asc" }] },
} satisfies Record<string, { label: string; orderBy: Prisma.ListingOrderByWithRelationInput[] }>;

type SortKey = keyof typeof SORTS;

export default async function LandPage(props: { searchParams: Promise<{ sort?: string }> }) {
  const { sort } = await props.searchParams;
  const active: SortKey = sort && sort in SORTS ? (sort as SortKey) : "score";

  const plots = await prisma.listing.findMany({
    where: { vertical: "land", status: "active" },
    orderBy: SORTS[active].orderBy,
    take: 90,
  });

  return (
    <main className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 pt-6">
          <SiteNav active="/land" />
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-6 pb-12 pt-8">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Listing Radar · Zadar
            </p>
            <h1 className="mt-3 font-heading text-6xl tracking-tight">Grundstücke</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {plots.length} aktive Inserate · sortiert nach {SORTS[active].label}
            </p>
          </div>
          <nav className="flex gap-1 rounded-full bg-muted p-1">
            {(Object.keys(SORTS) as SortKey[]).map((key) => (
              <Link
                key={key}
                href={`/land?sort=${key}`}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                  active === key
                    ? "bg-card font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {SORTS[key].label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {plots.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-20 text-center">
            <p className="font-heading text-2xl">Noch keine Grundstücke</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Sobald ein Njuskalo-Scrape lief, erscheinen die Inserate hier.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {plots.map((l) => (
              <LandCard key={l.id} l={l} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
