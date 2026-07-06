// Karte für ein Haus-Inserat (redaktioneller Look). Server-Komponente.
import { ScoreBadge, BreakdownList, listImage, fmtEur } from "./listing-bits";

export interface HouseCardData {
  id: string;
  title: string;
  priceEur: number;
  displayPriceEur: number | null;
  priceOnRequest: boolean;
  aiFairPriceEstimate: number | null;
  images: string[];
  areaLivingM2: number | null;
  rooms: number | null;
  yearBuilt: number | null;
  pricePerLivingM2: number | null;
  hasGarden: boolean | null;
  hasPool: boolean | null;
  hasParkingSpot: boolean | null;
  hasAirConditioning: boolean | null;
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

export function HouseCard({ h }: { h: HouseCardData }) {
  const img = listImage(h.images[0]);
  const effectiveScore = h.scoreOverride ?? h.score;
  const price = h.displayPriceEur ?? h.priceEur;
  const place =
    [h.locationRegion, h.locationCity]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(" · ") || "—";

  const amenities = [
    h.hasGarden ? "Garten" : null,
    h.hasPool ? "Pool" : null,
    h.hasParkingSpot ? "Stellplatz" : null,
    h.hasAirConditioning ? "Klima" : null,
  ].filter(Boolean) as string[];

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 transition-all duration-300 hover:-translate-y-1 hover:ring-foreground/20 hover:shadow-[0_22px_48px_-28px_oklch(0.24_0.012_60/0.55)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={h.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-sm text-muted-foreground">
            kein Bild
          </div>
        )}
        <ScoreBadge score={effectiveScore} overridden={h.scoreOverride != null} />
        {amenities.length > 0 ? (
          <div className="absolute left-3 top-3 flex flex-wrap gap-1">
            {amenities.map((a) => (
              <span
                key={a}
                className="rounded-full bg-card/85 px-2 py-1 text-[11px] font-medium text-foreground/80 backdrop-blur-sm"
              >
                {a}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="font-heading text-2xl leading-none tracking-tight">
          {h.priceOnRequest ? (
            <span>
              Preis auf Anfrage
              {h.aiFairPriceEstimate ? (
                <span className="ml-1 text-sm text-muted-foreground">
                  (KI-Schätzung ~{fmtEur(h.aiFairPriceEstimate)})
                </span>
              ) : null}
            </span>
          ) : (
            fmtEur(price)
          )}
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm leading-snug text-foreground/80">{h.title}</h3>
        <p className="mt-1.5 text-xs uppercase tracking-wide text-muted-foreground">{place}</p>

        <BreakdownList breakdown={h.scoreBreakdown} limit={4} className="mt-3" />

        <dl className="mt-auto grid grid-cols-4 gap-2 border-t border-border pt-3 text-center">
          <Stat label="m²" value={h.areaLivingM2 ?? "–"} />
          <Stat label="Zi." value={h.rooms ?? "–"} />
          <Stat label="Bj." value={h.yearBuilt ?? "–"} />
          <Stat label="€/m²" value={h.pricePerLivingM2 != null ? Math.round(h.pricePerLivingM2) : "–"} />
        </dl>

        <a
          href={h.url}
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
