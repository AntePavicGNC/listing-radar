// Karte für ein Auto-Inserat (SPEC §11): km, EZ, PS, Getriebe, Kraftstoff, Marke,
// Entfernung von Ismaning, Finanzierungsrate. Score groß + Begründung. Server-Komponente.
import Link from "next/link";
import { ScoreBadge, BreakdownList, fmtEur } from "./listing-bits";
import { FlagButtons, type Flags } from "./flag-buttons";
import { financingLabel } from "@/lib/finance";

export interface CarCardData {
  id: string;
  title: string;
  priceEur: number;
  displayPriceEur: number | null;
  images: string[];
  make: string | null;
  model: string | null;
  firstRegistrationYear: number | null;
  firstRegistrationMonth: number | null;
  mileageKm: number | null;
  fuel: string | null;
  transmission: string | null;
  powerPs: number | null;
  distanceFromIsmaningKm: number | null;
  score: number;
  scoreOverride: number | null;
  scoreBreakdown: unknown;
  url: string;
  userFlag?: { favorite: boolean; hidden: boolean; seen: boolean } | null;
}

const FUEL_LABEL: Record<string, string> = {
  diesel: "Diesel",
  petrol: "Benzin",
  hybrid_petrol: "Hybrid (Benzin)",
  hybrid_diesel: "Hybrid (Diesel)",
  electric: "Elektro",
  other: "Sonstige",
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-sm font-medium tabular-nums">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

export function CarCard({ c }: { c: CarCardData }) {
  const img = c.images[0] ?? null;
  const effectiveScore = c.scoreOverride ?? c.score;
  const price = c.displayPriceEur ?? c.priceEur;
  const ez = c.firstRegistrationYear
    ? `${c.firstRegistrationMonth ? String(c.firstRegistrationMonth).padStart(2, "0") + "/" : ""}${c.firstRegistrationYear}`
    : "–";

  const flags: Flags = {
    favorite: c.userFlag?.favorite ?? false,
    hidden: c.userFlag?.hidden ?? false,
    seen: c.userFlag?.seen ?? false,
  };

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 transition-all duration-300 hover:-translate-y-1 hover:ring-foreground/20 hover:shadow-[0_22px_48px_-28px_oklch(0.24_0.012_60/0.55)]">
      <Link href={`/listing/${c.id}`} className="relative block aspect-[4/3] overflow-hidden bg-muted">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={c.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-sm text-muted-foreground">
            kein Bild
          </div>
        )}
        <ScoreBadge score={effectiveScore} overridden={c.scoreOverride != null} />
        {c.distanceFromIsmaningKm != null ? (
          <div className="absolute left-3 top-3 rounded-full bg-card/85 px-2 py-1 text-[11px] font-medium text-foreground/80 backdrop-blur-sm">
            {Math.round(c.distanceFromIsmaningKm)} km von Ismaning
          </div>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="font-heading text-2xl leading-none tracking-tight">{fmtEur(price)}</div>
        <p className="mt-1 text-xs text-muted-foreground">{financingLabel(price)}</p>
        <Link href={`/listing/${c.id}`} className="mt-2 block hover:underline">
          <h3 className="line-clamp-2 text-sm leading-snug text-foreground/80">{c.title}</h3>
        </Link>

        <BreakdownList breakdown={c.scoreBreakdown} limit={4} className="mt-3" />

        <div className="mt-3">
          <FlagButtons listingId={c.id} flags={flags} compact />
        </div>

        <dl className="mt-auto grid grid-cols-4 gap-2 border-t border-border pt-3 text-center">
          <Stat label="km" value={c.mileageKm != null ? `${Math.round(c.mileageKm / 1000)}t` : "–"} />
          <Stat label="EZ" value={ez} />
          <Stat label="PS" value={c.powerPs ?? "–"} />
          <Stat
            label="Antrieb"
            value={`${c.transmission === "automatic" ? "Aut." : c.transmission === "manual" ? "Man." : "–"}${
              c.fuel ? " · " + (FUEL_LABEL[c.fuel] ?? c.fuel) : ""
            }`}
          />
        </dl>

        <a
          href={c.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          Zum Original-Inserat →
        </a>
      </div>
    </article>
  );
}
