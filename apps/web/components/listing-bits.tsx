// Geteilte Bausteine für Listing-Karten (Haus/Grundstück/Auto):
// Score-Badge, Plus/Minus-Breakdown, Bild-Helfer, Formatierung.
import type { ScoreReason } from "@/lib/normalize/types";

export const fmtEur = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

// Njuskalo-CDN liefert per Default 200x150-Thumbnails; auf das Vollbild heben
// (image-original liefert direkt 200; die sized-Varianten antworten nur mit 301).
export function listImage(url?: string): string | null {
  if (!url) return null;
  return url.replace(/\/image-\d+x\d+\//, "/image-original/");
}

function scoreStyle(score: number): { color: string; bg: string } {
  if (score >= 80) return { color: "oklch(0.46 0.072 148)", bg: "oklch(0.46 0.072 148 / 0.13)" };
  if (score >= 55) return { color: "oklch(0.5 0.13 65)", bg: "oklch(0.5 0.13 65 / 0.14)" };
  return { color: "oklch(0.5 0.018 70)", bg: "oklch(0.5 0.018 70 / 0.12)" };
}

/** Score groß und prominent (SPEC §11), optional mit Override-Markierung. */
export function ScoreBadge({
  score,
  overridden = false,
  size = "card",
}: {
  score: number;
  overridden?: boolean;
  size?: "card" | "detail";
}) {
  const s = scoreStyle(score);
  if (size === "detail") {
    return (
      <div
        className="inline-flex items-baseline gap-1.5 rounded-2xl px-4 py-2"
        style={{ color: s.color, background: s.bg }}
      >
        <span className="font-heading text-5xl leading-none tracking-tight tabular-nums">{score}</span>
        <span className="text-sm font-medium opacity-75">/100{overridden ? " · manuell" : ""}</span>
      </div>
    );
  }
  return (
    <div
      className="absolute right-3 top-3 rounded-full px-3 py-1.5 shadow-sm backdrop-blur-sm"
      style={{ color: s.color, background: s.bg }}
      title={overridden ? "Score manuell überschrieben" : "Score 0–100"}
    >
      <span className="font-heading text-xl font-semibold leading-none tabular-nums">{score}</span>
      {overridden ? <span className="ml-0.5 align-top text-[10px]">✎</span> : null}
    </div>
  );
}

/** Defensive Konvertierung des Json-Felds scoreBreakdown -> ScoreReason[]. */
export function parseBreakdown(raw: unknown): ScoreReason[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is ScoreReason =>
      r != null &&
      typeof r === "object" &&
      typeof (r as ScoreReason).label === "string" &&
      typeof (r as ScoreReason).points === "number",
  );
}

/** Plus-/Minuspunkte-Liste unter dem Score (SPEC §5/§11). */
export function BreakdownList({
  breakdown,
  limit = 4,
  className = "",
}: {
  breakdown: unknown;
  limit?: number;
  className?: string;
}) {
  const reasons = parseBreakdown(breakdown).slice(0, limit);
  if (reasons.length === 0) return null;
  return (
    <ul className={`space-y-1 text-xs leading-snug ${className}`}>
      {reasons.map((r) => (
        <li key={r.label} className="flex gap-1.5">
          <span
            className={
              r.points >= 0 ? "font-semibold text-primary" : "font-semibold text-destructive"
            }
          >
            {r.points >= 0 ? "+" : "−"}
          </span>
          <span className="text-foreground/75">{r.label}</span>
        </li>
      ))}
    </ul>
  );
}
