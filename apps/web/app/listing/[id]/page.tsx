import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Gallery } from "@/components/gallery";
import { FlagButtons } from "@/components/flag-buttons";
import { ScoreBadge, BreakdownList, listImage, fmtEur } from "@/components/listing-bits";
import { SiteNav } from "@/components/site-nav";
import { setScoreOverride } from "@/app/actions";
import { financingLabel } from "@/lib/finance";

export const dynamic = "force-dynamic";

const FUEL_LABEL: Record<string, string> = {
  diesel: "Diesel",
  petrol: "Benzin",
  hybrid_petrol: "Hybrid (Benzin)",
  hybrid_diesel: "Hybrid (Diesel)",
  electric: "Elektro",
  other: "Sonstige",
};

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function bool(v: boolean | null): string | null {
  return v == null ? null : v ? "Ja" : "Nein";
}

/** Kleiner Preisverlauf als Inline-SVG (SPEC §11). */
function PriceSparkline({ points }: { points: { date: Date; priceEur: number }[] }) {
  if (points.length < 2) return null;
  const w = 280;
  const h = 60;
  const min = Math.min(...points.map((p) => p.priceEur));
  const max = Math.max(...points.map((p) => p.priceEur));
  const span = max - min || 1;
  const xs = points.map((_, i) => (i / (points.length - 1)) * (w - 8) + 4);
  const ys = points.map((p) => h - 8 - ((p.priceEur - min) / span) * (h - 16));
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full max-w-[280px]">
      <path d={d} fill="none" stroke="oklch(0.46 0.072 148)" strokeWidth="2" />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r="2.5" fill="oklch(0.46 0.072 148)" />
      ))}
    </svg>
  );
}

export default async function ListingDetail(props: PageProps<"/listing/[id]">) {
  const { id } = await props.params;
  const l = await prisma.listing.findUnique({
    where: { id },
    include: { priceHistory: { orderBy: { date: "asc" } }, userFlag: true },
  });
  if (!l) notFound();

  const effectiveScore = l.scoreOverride ?? l.score;
  const price = l.displayPriceEur ?? l.priceEur;
  const images = l.images.map((u) => listImage(u)).filter(Boolean) as string[];
  const backHref = l.vertical === "house" ? "/houses" : l.vertical === "land" ? "/land" : "/cars";
  const flags = {
    favorite: l.userFlag?.favorite ?? false,
    hidden: l.userFlag?.hidden ?? false,
    seen: l.userFlag?.seen ?? false,
  };

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-6 pt-6">
        <SiteNav active={backHref} />
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link href={backHref} className="text-xs text-muted-foreground hover:text-foreground">
          ← zurück zur Liste
        </Link>

        <div className="mt-4 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
          {/* Linke Spalte: Galerie + Beschreibung */}
          <div>
            <Gallery images={images} alt={l.title} />
            {l.description ? (
              <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-foreground/80">
                {l.description}
              </p>
            ) : null}
          </div>

          {/* Rechte Spalte: Score, Preis, Fakten */}
          <div>
            <div className="flex items-start justify-between gap-4">
              <ScoreBadge score={effectiveScore} overridden={l.scoreOverride != null} size="detail" />
              <FlagButtons listingId={l.id} flags={flags} />
            </div>
            {l.scoreOverrideNote ? (
              <p className="mt-2 text-xs italic text-muted-foreground">Notiz: {l.scoreOverrideNote}</p>
            ) : null}

            <BreakdownList breakdown={l.scoreBreakdown} limit={99} className="mt-4" />

            <h1 className="mt-6 font-heading text-3xl leading-tight tracking-tight">{l.title}</h1>
            <div className="mt-3 font-heading text-4xl tracking-tight">
              {l.priceOnRequest ? (
                <span>
                  Preis auf Anfrage
                  {l.aiFairPriceEstimate ? (
                    <span className="ml-2 text-base text-muted-foreground">
                      (KI-Schätzung ~{fmtEur(l.aiFairPriceEstimate)})
                    </span>
                  ) : null}
                </span>
              ) : (
                fmtEur(price)
              )}
            </div>
            {l.vertical === "car" ? (
              <p className="mt-1.5 text-sm text-muted-foreground">
                Finanzierung: {financingLabel(price)}{" "}
                <span className="text-xs">(7 % eff. Richtwert, bonitätsabhängig)</span>
              </p>
            ) : null}

            {l.priceHistory.length > 1 ? (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Preisverlauf</p>
                <PriceSparkline points={l.priceHistory} />
              </div>
            ) : null}

            <dl className="mt-6">
              <Row label="Ort" value={l.locationRaw} />
              {l.locationScore != null ? <Row label="Location-Score" value={`${l.locationScore}/10`} /> : null}

              {/* Haus */}
              {l.vertical === "house" ? (
                <>
                  <Row label="Wohnfläche" value={l.areaLivingM2 ? `${l.areaLivingM2} m²` : null} />
                  <Row label="Grundstück" value={l.areaPlotM2 ? `${l.areaPlotM2} m²` : null} />
                  <Row label="Zimmer" value={l.rooms} />
                  <Row label="Bäder" value={l.bathroomCount} />
                  <Row label="Baujahr" value={l.yearBuilt} />
                  <Row label="Renoviert" value={l.yearRenovated} />
                  <Row label="€/Wohn-m²" value={l.pricePerLivingM2 ? Math.round(l.pricePerLivingM2) : null} />
                  <Row label="€/Grundstücks-m²" value={l.pricePerPlotM2 ? Math.round(l.pricePerPlotM2) : null} />
                  <Row label="Garten" value={bool(l.hasGarden)} />
                  <Row label="Pool" value={bool(l.hasPool)} />
                  <Row label="Stellplatz" value={bool(l.hasParkingSpot)} />
                  <Row label="Garage" value={bool(l.hasGarage)} />
                  <Row label="Klimaanlage" value={bool(l.hasAirConditioning)} />
                  <Row label="Nebengebäude" value={bool(l.hasAuxiliaryBuilding)} />
                  <Row label="Heizung" value={l.heatingType} />
                  <Row label="Meerblick wahrscheinlich" value={bool(l.hasSeaViewLikely)} />
                </>
              ) : null}

              {/* Grundstück */}
              {l.vertical === "land" ? (
                <>
                  <Row label="Fläche" value={l.areaPlotM2 ? `${Math.round(l.areaPlotM2)} m²` : null} />
                  <Row label="€/m²" value={l.pricePerM2 ? Math.round(l.pricePerM2) : null} />
                  <Row
                    label="Zonierung"
                    value={
                      l.zoningConfirmedBuildingLand === true
                        ? "Baugrund bestätigt"
                        : l.zoningStated === true && l.zoningConfirmedBuildingLand === false
                          ? "Kein Baugrund"
                          : "Unklar — bitte selbst prüfen"
                    }
                  />
                </>
              ) : null}

              {/* Auto */}
              {l.vertical === "car" ? (
                <>
                  <Row label="Marke / Modell" value={[l.make, l.model, l.variant].filter(Boolean).join(" ")} />
                  <Row
                    label="Erstzulassung"
                    value={
                      l.firstRegistrationYear
                        ? `${l.firstRegistrationMonth ? String(l.firstRegistrationMonth).padStart(2, "0") + "/" : ""}${l.firstRegistrationYear}`
                        : null
                    }
                  />
                  <Row label="Kilometerstand" value={l.mileageKm ? `${l.mileageKm.toLocaleString("de-DE")} km` : null} />
                  <Row label="Leistung" value={l.powerPs ? `${l.powerPs} PS` : null} />
                  <Row label="Getriebe" value={l.transmission === "automatic" ? "Automatik" : l.transmission === "manual" ? "Schaltung" : null} />
                  <Row label="Kraftstoff" value={l.fuel ? (FUEL_LABEL[l.fuel] ?? l.fuel) : null} />
                  <Row label="Reichweite" value={l.rangeKm ? `${l.rangeKm} km` : null} />
                  <Row label="Karosserie" value={l.bodyType} />
                  <Row label="Entfernung Ismaning" value={l.distanceFromIsmaningKm != null ? `${Math.round(l.distanceFromIsmaningKm)} km` : null} />
                  <Row label="Adaptiver Tempomat" value={bool(l.hasAdaptiveCruiseControl)} />
                  <Row label="Einparkkamera" value={bool(l.hasParkingCamera)} />
                  <Row label="Infotainment" value={l.infotainmentGeneration} />
                </>
              ) : null}

              {l.aiImageScore != null ? <Row label="KI-Bild-Score" value={`${l.aiImageScore}/100`} /> : null}
            </dl>
            {l.aiImageNotes ? (
              <p className="mt-3 rounded-xl bg-muted p-3 text-xs leading-relaxed text-foreground/75">
                <span className="font-medium">KI-Bewertung:</span> {l.aiImageNotes}
              </p>
            ) : null}

            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Original-Inserat öffnen →
            </a>

            {/* Score-Override (SPEC §9): überschreibt die Anzeige, übersteht Re-Scrapes */}
            <form
              action={setScoreOverride}
              className="mt-8 rounded-2xl bg-muted/60 p-4 ring-1 ring-border"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Score manuell überschreiben
              </p>
              <input type="hidden" name="listingId" value={l.id} />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  name="scoreOverride"
                  min={0}
                  max={100}
                  defaultValue={l.scoreOverride ?? ""}
                  placeholder={`${l.score}`}
                  className="w-20 rounded-lg border border-input bg-card px-2 py-1.5 text-sm tabular-nums"
                />
                <input
                  type="text"
                  name="scoreOverrideNote"
                  defaultValue={l.scoreOverrideNote ?? ""}
                  placeholder="Notiz (optional)"
                  className="min-w-40 flex-1 rounded-lg border border-input bg-card px-2 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-85"
                >
                  Speichern
                </button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Leer lassen + Speichern entfernt den Override (berechneter Score: {l.score}).
              </p>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
