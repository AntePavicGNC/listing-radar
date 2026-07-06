// Karte für ein Grundstücks-Inserat (SPEC §11): m², €/m², Zonierungs-Status,
// Ort, Score groß + Plus/Minus-Begründung. Server-Komponente.
import { ScoreBadge, BreakdownList, listImage, fmtEur } from "./listing-bits";

export interface LandCardData {
  id: string;
  title: string;
  priceEur: number;
  displayPriceEur: number | null;
  priceOnRequest: boolean;
  aiFairPriceEstimate: number | null;
  images: string[];
  areaPlotM2: number | null;
  pricePerM2: number | null;
  zoningStated: boolean | null;
  zoningConfirmedBuildingLand: boolean | null;
  score: number;
  scoreOverride: number | null;
  scoreBreakdown: unknown;
  locationCity: string | null;
  locationRegion: string | null;
  url: string;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-sm font-medium tabular-nums">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function ZoningBadge({ stated, confirmed }: { stated: boolean | null; confirmed: boolean | null }) {
  if (confirmed === true) {
    return (
      <span className="rounded-full bg-primary/12 px-2 py-1 text-[11px] font-medium text-primary">
        Baugrund bestätigt
      </span>
    );
  }
  if (stated === true && confirmed === false) {
    return (
      <span className="rounded-full bg-destructive/12 px-2 py-1 text-[11px] font-medium text-destructive">
        Kein Baugrund
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
      Zonierung unklar
    </span>
  );
}

export function LandCard({ l }: { l: LandCardData }) {
  const img = listImage(l.images[0]);
  const effectiveScore = l.scoreOverride ?? l.score;
  const price = l.displayPriceEur ?? l.priceEur;
  const place =
    [l.locationRegion, l.locationCity]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(" · ") || "—";

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 transition-all duration-300 hover:-translate-y-1 hover:ring-foreground/20 hover:shadow-[0_22px_48px_-28px_oklch(0.24_0.012_60/0.55)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={l.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-sm text-muted-foreground">
            kein Bild
          </div>
        )}
        <ScoreBadge score={effectiveScore} overridden={l.scoreOverride != null} />
        <div className="absolute left-3 top-3">
          <ZoningBadge stated={l.zoningStated} confirmed={l.zoningConfirmedBuildingLand} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="font-heading text-2xl leading-none tracking-tight">
          {l.priceOnRequest ? (
            <span>
              Preis auf Anfrage
              {l.aiFairPriceEstimate ? (
                <span className="ml-1 text-sm text-muted-foreground">
                  (KI-Schätzung ~{fmtEur(l.aiFairPriceEstimate)})
                </span>
              ) : null}
            </span>
          ) : (
            fmtEur(price)
          )}
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm leading-snug text-foreground/80">{l.title}</h3>
        <p className="mt-1.5 text-xs uppercase tracking-wide text-muted-foreground">{place}</p>

        <BreakdownList breakdown={l.scoreBreakdown} limit={4} className="mt-3" />

        <dl className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-3 text-center">
          <Stat label="m²" value={l.areaPlotM2 != null ? Math.round(l.areaPlotM2) : "–"} />
          <Stat label="€/m²" value={l.pricePerM2 != null ? Math.round(l.pricePerM2) : "–"} />
        </dl>

        <a
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          Auf Njuskalo ansehen →
        </a>
      </div>
    </article>
  );
}
