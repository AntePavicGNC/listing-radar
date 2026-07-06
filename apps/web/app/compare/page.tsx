import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SiteNav } from "@/components/site-nav";
import { fmtEur, listImage } from "@/components/listing-bits";
import { computeFinancing } from "@/lib/finance";
import type { Listing } from "@/lib/generated/prisma/client";

export const dynamic = "force-dynamic";

type VerticalKey = "land" | "house" | "car";
const VERTICALS: Record<VerticalKey, string> = { land: "Grundstücke", house: "Häuser", car: "Autos" };

interface MetricRow {
  label: string;
  value: (l: Listing) => number | null; // Rohwert für den Vergleich
  format: (v: number) => string;
  best: "min" | "max";
}

const CURRENT_YEAR = new Date().getFullYear();

const METRICS: Record<VerticalKey, MetricRow[]> = {
  land: [
    { label: "Score", value: (l) => l.scoreOverride ?? l.score, format: (v) => `${v}/100`, best: "max" },
    { label: "Preis", value: (l) => l.displayPriceEur ?? l.priceEur, format: fmtEur, best: "min" },
    { label: "Fläche", value: (l) => l.areaPlotM2, format: (v) => `${Math.round(v)} m²`, best: "max" },
    { label: "€/m²", value: (l) => l.pricePerM2, format: (v) => `${Math.round(v)} €`, best: "min" },
    { label: "Location-Score", value: (l) => l.locationScore, format: (v) => `${v}/10`, best: "max" },
  ],
  house: [
    { label: "Score", value: (l) => l.scoreOverride ?? l.score, format: (v) => `${v}/100`, best: "max" },
    { label: "Preis", value: (l) => l.displayPriceEur ?? l.priceEur, format: fmtEur, best: "min" },
    { label: "€/Wohn-m²", value: (l) => l.pricePerLivingM2, format: (v) => `${Math.round(v)} €`, best: "min" },
    { label: "Wohnfläche", value: (l) => l.areaLivingM2, format: (v) => `${Math.round(v)} m²`, best: "max" },
    { label: "Grundstück", value: (l) => l.areaPlotM2, format: (v) => `${Math.round(v)} m²`, best: "max" },
    { label: "Zimmer", value: (l) => l.rooms, format: (v) => `${v}`, best: "max" },
    { label: "Baujahr", value: (l) => l.yearBuilt, format: (v) => `${v}`, best: "max" },
    { label: "Location-Score", value: (l) => l.locationScore, format: (v) => `${v}/10`, best: "max" },
  ],
  car: [
    { label: "Score", value: (l) => l.scoreOverride ?? l.score, format: (v) => `${v}/100`, best: "max" },
    { label: "Preis", value: (l) => l.displayPriceEur ?? l.priceEur, format: fmtEur, best: "min" },
    { label: "Kilometerstand", value: (l) => l.mileageKm, format: (v) => `${v.toLocaleString("de-DE")} km`, best: "min" },
    { label: "Erstzulassung", value: (l) => l.firstRegistrationYear, format: (v) => `${v}`, best: "max" },
    { label: "PS", value: (l) => l.powerPs, format: (v) => `${v}`, best: "max" },
    { label: "Entfernung Ismaning", value: (l) => l.distanceFromIsmaningKm, format: (v) => `${Math.round(v)} km`, best: "min" },
    {
      label: "Rate/Monat",
      value: (l) => computeFinancing(l.displayPriceEur ?? l.priceEur).monthlyRateEur,
      format: (v) => `${v} €`,
      best: "min",
    },
    // Abgeleitete Sinn-Metriken (SPEC §11): Preis im Verhältnis zu PS bzw. km+Alter
    {
      label: "€ pro PS",
      value: (l) => (l.powerPs ? Math.round((l.displayPriceEur ?? l.priceEur) / l.powerPs) : null),
      format: (v) => `${v} €`,
      best: "min",
    },
    {
      label: "km pro Jahr",
      value: (l) =>
        l.mileageKm != null && l.firstRegistrationYear
          ? Math.round(l.mileageKm / Math.max(1, CURRENT_YEAR - l.firstRegistrationYear + 0.5))
          : null,
      format: (v) => `${v.toLocaleString("de-DE")}`,
      best: "min",
    },
  ],
};

export default async function ComparePage(props: { searchParams: Promise<{ vertical?: string }> }) {
  const { vertical } = await props.searchParams;
  const active: VerticalKey = vertical === "house" || vertical === "car" ? vertical : "land";

  const listings = await prisma.listing.findMany({
    where: { vertical: active, status: "active", userFlag: { is: { favorite: true } } },
    orderBy: { score: "desc" },
    take: 6,
  });

  const metrics = METRICS[active];

  return (
    <main className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 pt-6">
          <SiteNav active="/compare" />
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-6 pb-12 pt-8">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Favoriten nebeneinander
            </p>
            <h1 className="mt-3 font-heading text-6xl tracking-tight">Vergleich</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Bester Wert je Zeile ist hervorgehoben. Favoriten setzt du per ★ auf den Karten.
            </p>
          </div>
          <nav className="flex gap-1 rounded-full bg-muted p-1">
            {(Object.keys(VERTICALS) as VerticalKey[]).map((key) => (
              <Link
                key={key}
                href={`/compare?vertical=${key}`}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                  active === key
                    ? "bg-card font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {VERTICALS[key]}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {listings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-20 text-center">
            <p className="font-heading text-2xl">Keine Favoriten bei {VERTICALS[active]}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Markiere Inserate mit ★ auf den Karten, dann erscheinen sie hier zum Vergleich.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl ring-1 ring-border">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-44 bg-muted/60 p-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Kennzahl
                  </th>
                  {listings.map((l) => (
                    <th key={l.id} className="bg-muted/60 p-3 text-left align-bottom">
                      <Link href={`/listing/${l.id}`} className="group block">
                        {l.images[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={listImage(l.images[0]) ?? undefined}
                            alt=""
                            className="mb-2 aspect-[4/3] w-full rounded-lg object-cover"
                          />
                        ) : null}
                        <span className="line-clamp-2 text-xs font-medium leading-snug group-hover:underline">
                          {l.title}
                        </span>
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => {
                  const values = listings.map((l) => m.value(l));
                  const present = values.filter((v): v is number => v != null && Number.isFinite(v));
                  const best =
                    present.length > 0
                      ? m.best === "min"
                        ? Math.min(...present)
                        : Math.max(...present)
                      : null;
                  return (
                    <tr key={m.label} className="border-t border-border/60">
                      <td className="p-3 text-muted-foreground">{m.label}</td>
                      {values.map((v, i) => (
                        <td
                          key={listings[i].id}
                          className={`p-3 tabular-nums ${
                            v != null && v === best && present.length > 1
                              ? "bg-primary/10 font-semibold text-primary"
                              : ""
                          }`}
                        >
                          {v != null ? m.format(v) : "–"}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
