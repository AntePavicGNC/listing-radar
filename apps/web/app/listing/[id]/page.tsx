import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Gallery } from "@/components/gallery";
import { FlagButtons } from "@/components/flag-buttons";
import { ScoreBadge, ScoreTable, listImage, fmtEur } from "@/components/listing-bits";
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

// Datenblatt-Zeile: fehlende Werte werden IMMER als "—" gezeigt (Entscheidungsgrundlage),
// nicht versteckt — so sieht man auch, was das Portal nicht liefert.
function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  const missing = value == null || value === "";
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right font-medium ${missing ? "text-muted-foreground/50" : ""}`}>
        {missing ? "—" : value}
      </dd>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function bool(v: boolean | null): string | null {
  return v == null ? null : v ? "Ja" : "Nein";
}

const fmtDate = (d: Date) => d.toLocaleDateString("de-DE");

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

            <ScoreTable breakdown={l.scoreBreakdown} score={l.score} />

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

            {(() => {
              // Abgeleitete Kennzahlen (immer berechnen, wenn Basisdaten da sind)
              const ppLiving =
                l.pricePerLivingM2 ??
                (l.areaLivingM2 && l.areaLivingM2 > 0 ? price / l.areaLivingM2 : null);
              const ppPlot =
                l.pricePerPlotM2 ??
                (l.vertical === "land" ? l.pricePerM2 : null) ??
                (l.areaPlotM2 && l.areaPlotM2 > 0 ? price / l.areaPlotM2 : null);
              const daysOnline = Math.max(
                0,
                Math.floor((Date.now() - l.firstSeenAt.getTime()) / 86_400_000),
              );
              const firstPrice = l.priceHistory[0]?.priceEur ?? null;
              const priceDelta = firstPrice != null && firstPrice !== l.priceEur ? l.priceEur - firstPrice : null;
              const carAge =
                l.firstRegistrationYear != null
                  ? Math.max(0.5, new Date().getFullYear() - l.firstRegistrationYear + 0.5)
                  : null;

              return (
                <dl className="mt-4">
                  <SectionTitle>Lage</SectionTitle>
                  <Row label="Ort" value={l.locationRaw} />
                  <Row label="Location-Score (Ortstabelle)" value={l.locationScore != null ? `${l.locationScore}/10` : null} />
                  {l.vertical === "car" ? (
                    <Row label="Entfernung Ismaning" value={l.distanceFromIsmaningKm != null ? `${Math.round(l.distanceFromIsmaningKm)} km` : null} />
                  ) : null}

                  <SectionTitle>Preis &amp; abgeleitete Kennzahlen</SectionTitle>
                  <Row label="Preis" value={l.priceOnRequest ? "Auf Anfrage" : fmtEur(price)} />
                  {l.displayPriceEur != null && l.displayPriceEur !== l.priceEur ? (
                    <Row label="Portal-Preis (Rohwert)" value={fmtEur(l.priceEur)} />
                  ) : null}
                  {l.vertical !== "car" ? (
                    <>
                      {l.vertical === "house" ? (
                        <Row label="€ / Wohn-m²" value={ppLiving ? `${Math.round(ppLiving)} €` : null} />
                      ) : null}
                      <Row label="€ / Grundstücks-m²" value={ppPlot ? `${Math.round(ppPlot)} €` : null} />
                    </>
                  ) : (
                    <>
                      <Row label="Finanzierungsrate" value={financingLabel(price)} />
                      <Row label="€ pro PS" value={l.powerPs ? `${Math.round(price / l.powerPs)} €` : null} />
                      <Row label="km pro Jahr" value={l.mileageKm != null && carAge ? `${Math.round(l.mileageKm / carAge).toLocaleString("de-DE")}` : null} />
                    </>
                  )}
                  <Row label="Preisänderung seit Erstsichtung" value={priceDelta != null ? `${priceDelta > 0 ? "+" : ""}${fmtEur(priceDelta)}` : "keine"} />

                  {l.vertical === "house" ? (
                    <>
                      <SectionTitle>Objekt</SectionTitle>
                      <Row label="Wohnfläche" value={l.areaLivingM2 ? `${l.areaLivingM2} m²` : null} />
                      <Row label="Grundstück" value={l.areaPlotM2 ? `${l.areaPlotM2} m²` : null} />
                      <Row label="Zimmer" value={l.rooms} />
                      <Row label="Bäder" value={l.bathroomCount} />
                      <Row label="Baujahr" value={l.yearBuilt} />
                      <Row label="Renoviert" value={l.yearRenovated} />
                      <Row
                        label="Renovierungsbedarf"
                        value={
                          l.renovationNeeded
                            ? ({ none: "keiner", light: "leicht", moderate: "mittel", heavy: "stark / Rohbau" } as const)[l.renovationNeeded]
                            : null
                        }
                      />
                      <SectionTitle>Ausstattung</SectionTitle>
                      <Row label="Garten" value={bool(l.hasGarden)} />
                      <Row label="Pool" value={bool(l.hasPool)} />
                      <Row label="Stellplatz" value={bool(l.hasParkingSpot)} />
                      <Row label="Garage" value={bool(l.hasGarage)} />
                      <Row label="Klimaanlage" value={bool(l.hasAirConditioning)} />
                      <Row label="Nebengebäude" value={bool(l.hasAuxiliaryBuilding)} />
                      <Row label="Heizung" value={l.heatingType} />
                      <Row label="Meerblick wahrscheinlich (KI)" value={bool(l.hasSeaViewLikely)} />
                      <Row label="Ferienvermietungs-Optik (KI)" value={bool(l.looksLikeTouristRental)} />
                    </>
                  ) : null}

                  {l.vertical === "land" ? (
                    <>
                      <SectionTitle>Grundstück</SectionTitle>
                      <Row label="Fläche" value={l.areaPlotM2 ? `${Math.round(l.areaPlotM2)} m²` : null} />
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

                  {l.vertical === "car" ? (
                    <>
                      <SectionTitle>Fahrzeug</SectionTitle>
                      <Row label="Marke / Modell" value={[l.make, l.model].filter(Boolean).join(" ") || null} />
                      <Row label="Variante" value={l.variant} />
                      <Row
                        label="Erstzulassung"
                        value={
                          l.firstRegistrationYear
                            ? `${l.firstRegistrationMonth ? String(l.firstRegistrationMonth).padStart(2, "0") + "/" : ""}${l.firstRegistrationYear}`
                            : null
                        }
                      />
                      <Row label="Kilometerstand" value={l.mileageKm != null ? `${l.mileageKm.toLocaleString("de-DE")} km` : null} />
                      <Row label="Leistung" value={l.powerPs ? `${l.powerPs} PS` : null} />
                      <Row label="Getriebe" value={l.transmission === "automatic" ? "Automatik" : l.transmission === "manual" ? "Schaltung" : null} />
                      <Row label="Kraftstoff" value={l.fuel ? (FUEL_LABEL[l.fuel] ?? l.fuel) : null} />
                      <Row label="Reichweite (Elektro)" value={l.rangeKm ? `${l.rangeKm} km` : null} />
                      <Row
                        label="Karosserie"
                        value={
                          l.bodyType
                            ? ({ limousine: "Limousine", sportback: "Sportback/Fließheck", suv: "SUV", suv_coupe: "Coupé-SUV", kombi: "Kombi", other: "Sonstige" } as const)[l.bodyType]
                            : null
                        }
                      />
                      <SectionTitle>Ausstattung</SectionTitle>
                      <Row label="Adaptiver Tempomat (ACC)" value={bool(l.hasAdaptiveCruiseControl)} />
                      <Row label="Einparkkamera" value={bool(l.hasParkingCamera)} />
                      <Row label="Infotainment-Generation" value={l.infotainmentGeneration} />
                    </>
                  ) : null}

                  <SectionTitle>Inserat</SectionTitle>
                  <Row label="Quelle" value={l.source} />
                  <Row label="Online seit (bei uns)" value={`${fmtDate(l.firstSeenAt)} (${daysOnline} Tag${daysOnline === 1 ? "" : "e"})`} />
                  <Row label="Zuletzt gesehen" value={fmtDate(l.lastSeenAt)} />
                  <Row label="Vom Portal eingestellt" value={l.postedAt ? fmtDate(l.postedAt) : null} />
                  {l.vertical !== "car" ? <Row label="KI-Bild-Score" value={l.aiImageScore != null ? `${l.aiImageScore}/100` : null} /> : null}
                </dl>
              );
            })()}
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
