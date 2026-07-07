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

/** Kompakte Plus-/Minuspunkte-Liste auf den Karten (nur echte Beiträge, SPEC §5/§11). */
export function BreakdownList({
  breakdown,
  limit = 4,
  className = "",
}: {
  breakdown: unknown;
  limit?: number;
  className?: string;
}) {
  const reasons = parseBreakdown(breakdown)
    .filter((r) => r.points !== 0)
    .slice(0, limit);
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

/**
 * Vollständige Score-Zusammensetzung für die Detailseite: alle bewerteten
 * Kriterien mit Erfüllungsgrad-Balken, Punkte-Beitrag und Gewicht, danach
 * die Kriterien ohne Angabe (zählen neutral).
 */
export function ScoreTable({ breakdown, score }: { breakdown: unknown; score: number }) {
  const all = parseBreakdown(breakdown);
  const rated = all.filter((r) => r.pct != null || r.points !== 0);
  const missing = all.filter((r) => r.pct == null && r.points === 0);
  if (all.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl bg-muted/50 p-4 ring-1 ring-border">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        So setzt sich der Score zusammen
      </p>
      <ul className="mt-3 space-y-2">
        {rated.map((r) => (
          <li key={r.label} className="text-xs leading-snug">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-foreground/85">{r.label}</span>
              <span
                className={`shrink-0 font-semibold tabular-nums ${
                  r.points > 0 ? "text-primary" : r.points < 0 ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {r.points > 0 ? `+${r.points}` : r.points}
                {r.weight != null ? (
                  <span className="ml-1 font-normal text-muted-foreground">/ ±{r.weight}</span>
                ) : null}
              </span>
            </div>
            {r.pct != null ? (
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border/60">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${r.pct}%`,
                    background: r.pct >= 70 ? "oklch(0.46 0.072 148)" : r.pct >= 40 ? "oklch(0.5 0.13 65)" : "oklch(0.55 0.2 27)",
                  }}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {missing.length > 0 ? (
        <div className="mt-4 border-t border-border/60 pt-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Ohne Angabe (zählt neutral, drückt den Score nicht)
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {missing.map((m) => m.label.replace(/: keine Angabe$/, "")).join(" · ")}
          </p>
        </div>
      ) : null}

      <p className="mt-3 border-t border-border/60 pt-2 text-[11px] leading-relaxed text-muted-foreground">
        Score {score}/100 = gewichteter Schnitt der bewerteten Kriterien. Punkte = Beitrag
        relativ zu neutral (max. ± Gewicht); Balken = Erfüllungsgrad des Kriteriums.
        Gewichte justierbar in <code className="font-mono">lib/config.ts</code>, danach{" "}
        <code className="font-mono">POST /api/rescore</code>.
      </p>
    </div>
  );
}
