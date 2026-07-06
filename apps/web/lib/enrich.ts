// lib/enrich.ts — Anreicherung VOR Filter/Scoring (SPEC §9).
// Stufe 1 (regelbasiert, ohne KI): Fake-Preis-Erkennung + "Preis auf Anfrage".
// Stufe 2 (KI: Preis aus Fließtext, Fair-Preis-Schätzung, Bildbewertung) folgt,
// sobald ANTHROPIC_API_KEY vorhanden ist — Einstiegspunkt bleibt dieselbe Funktion.
import type { NormalizedListing } from "./normalize/types";

/** Unplausibel niedriger Preis bei Immobilien (SPEC §9: z. B. 1-Euro-Fake). */
const IMPLAUSIBLE_PRICE_BELOW = 1000;

/** "Preis auf Anfrage" in HR/DE/EN erkennen. */
const PRICE_ON_REQUEST_RE =
  /cijena\s+na\s+upit|na\s+upit|po\s+dogovoru|price\s+on\s+request|preis\s+auf\s+anfrage|auf\s+anfrage/i;

/**
 * Preisangabe aus Titel/Beschreibung ziehen (Regex-Stufe).
 * Fängt "95.000 €", "95000 EUR", "€ 95.000,00", "95.000eura" u. ä.
 */
export function extractPriceFromText(text: string): number | null {
  const candidates: number[] = [];
  const re = /(?:€\s*)?(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})(?:[,.]\d{2})?\s*(?:€|eur\b|eura\b|euro\b)?/gi;
  for (const m of text.matchAll(re)) {
    const hasCurrency = /€|eur/i.test(m[0]);
    const numeric = Number(m[1].replace(/[.\s]/g, ""));
    if (!Number.isFinite(numeric)) continue;
    // Ohne Währungszeichen nur Werte mit Tausender-Gruppierung akzeptieren (sonst matchen Flächen/IDs)
    if (!hasCurrency && !/[.\s]/.test(m[1])) continue;
    if (numeric >= 5_000 && numeric <= 2_000_000) candidates.push(numeric);
  }
  if (candidates.length === 0) return null;
  // Bei mehreren Kandidaten den größten nehmen (Flächen/Nebenzahlen sind meist kleiner)
  return Math.max(...candidates);
}

/**
 * Regelbasierte Preis-Anreicherung (Häuser + Grundstücke), mutiert nicht.
 * - Plausibler Portal-Preis -> unverändert.
 * - Fake-Preis + Preis im Text gefunden -> displayPriceEur gesetzt.
 * - Fake-Preis + "auf Anfrage" (oder nichts gefunden) -> priceOnRequest = true.
 */
export function applyPriceRules(n: NormalizedListing): NormalizedListing {
  if (n.vertical === "car") return n;
  if (n.priceEur >= IMPLAUSIBLE_PRICE_BELOW) return n;

  const text = `${n.title ?? ""} ${n.description ?? ""}`;
  const extracted = extractPriceFromText(text);
  if (extracted != null) {
    return { ...n, displayPriceEur: extracted };
  }
  if (PRICE_ON_REQUEST_RE.test(text) || n.priceEur < IMPLAUSIBLE_PRICE_BELOW) {
    return { ...n, priceOnRequest: true };
  }
  return n;
}
