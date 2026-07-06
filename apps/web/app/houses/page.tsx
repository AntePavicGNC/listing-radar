import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { HouseCard } from "@/components/house-card";
import { SiteNav } from "@/components/site-nav";
import type { Prisma } from "@/lib/generated/prisma/client";

export const dynamic = "force-dynamic";

const SORTS = {
  score: { label: "Score", orderBy: [{ score: "desc" }, { firstSeenAt: "desc" }] },
  preis: { label: "Preis", orderBy: [{ priceEur: "asc" }] },
  flaeche: { label: "€/m²", orderBy: [{ pricePerLivingM2: "asc" }] },
} satisfies Record<string, { label: string; orderBy: Prisma.ListingOrderByWithRelationInput[] }>;

type SortKey = keyof typeof SORTS;

export default async function HousesPage(props: {
  searchParams: Promise<{ sort?: string; raus?: string }>;
}) {
  const { sort, raus } = await props.searchParams;
  const active: SortKey = sort && sort in SORTS ? (sort as SortKey) : "score";
  const showHidden = raus === "1";

  const houses = await prisma.listing.findMany({
    where: {
      vertical: "house",
      status: "active",
      // "raus" markierte Inserate sind standardmäßig ausgeblendet (SPEC §11)
      ...(showHidden ? {} : { OR: [{ userFlag: null }, { userFlag: { hidden: false } }] }),
    },
    orderBy: SORTS[active].orderBy,
    include: { userFlag: true },
    take: 90,
  });

  return (
    <main className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 pt-6">
          <SiteNav active="/houses" />
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-6 pb-12 pt-8">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Listing Radar · Zadar
            </p>
            <h1 className="mt-3 font-heading text-6xl tracking-tight">Häuser</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {houses.length} aktive Inserate · sortiert nach {SORTS[active].label} ·{" "}
              <Link
                href={showHidden ? `/houses?sort=${active}` : `/houses?sort=${active}&raus=1`}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {showHidden ? "Ausgeblendete verbergen" : "Ausgeblendete zeigen"}
              </Link>
            </p>
          </div>
          <nav className="flex gap-1 rounded-full bg-muted p-1">
            {(Object.keys(SORTS) as SortKey[]).map((key) => (
              <Link
                key={key}
                href={`/houses?sort=${key}`}
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
        {houses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-20 text-center">
            <p className="font-heading text-2xl">Noch keine Häuser</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Sobald ein Njuskalo-Scrape lief, erscheinen die Inserate hier.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {houses.map((h) => (
              <HouseCard key={h.id} h={h} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
