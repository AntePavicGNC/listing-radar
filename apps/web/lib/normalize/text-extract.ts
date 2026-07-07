// Fallback-Extraktion aus Titel/Beschreibung (Feedback Ante 07/2026):
// Portale liefern oft keine Strukturdaten, obwohl sie im Text stehen
// ("Građevinsko zemljište 379 m2"). Konservative Regexe, DE/HR/EN.

const AREA_RE = /(\d{1,3}(?:[.\s]\d{3})*|\d+)(?:[.,](\d{1,2}))?\s*(?:m2|m²|qm|kvadrat\w*)/gi;

// Kontext VOR der Zahl entscheidet, ob Wohnfläche oder Grundstück gemeint ist
const PLOT_CTX = /oku[ćc]nic|zemlji[šs]t|teren|parcel|plac\b|placa|vrt\b|grundst[üu]ck|land\s*area|plot/i;
const LIVING_CTX = /stamben|ku[ćc][ae]?\b|house|wohnfl|neto|bruto|korisn|living/i;

function parseAreaNum(intPart: string, frac?: string): number | null {
  const n = parseFloat(intPart.replace(/[.\s]/g, "") + (frac ? "." + frac : ""));
  // Plausibilität: 10 m² bis 100.000 m² (10 ha)
  return Number.isFinite(n) && n >= 10 && n <= 100_000 ? n : null;
}

/** Alle Flächenangaben im Text finden und nach Kontext klassifizieren. */
export function extractAreas(text: string): {
  living: number | null;
  plot: number | null;
  any: number | null;
} {
  let living: number | null = null;
  let plot: number | null = null;
  let any: number | null = null;
  for (const m of text.matchAll(AREA_RE)) {
    const n = parseAreaNum(m[1], m[2]);
    if (n == null) continue;
    const ctx = text.slice(Math.max(0, (m.index ?? 0) - 30), m.index ?? 0);
    if (PLOT_CTX.test(ctx)) plot ??= n;
    else if (LIVING_CTX.test(ctx)) living ??= n;
    any ??= n;
  }
  return { living, plot, any };
}

// Kroatische Zimmer-Wörter (trosoban = 3-Zimmer) + explizite Angaben
const ROOM_WORDS: Array<[RegExp, number]> = [
  [/garsonijer|jednosoban|jednosobni/i, 1],
  [/dvosoban|dvosobni|dvoiposoban/i, 2],
  [/trosoban|trosobni|troiposoban/i, 3],
  [/[čc]etverosoban|[čc]etverosobni/i, 4],
  [/pet(?:ero)?soban/i, 5],
];
const ROOM_RE = /(\d{1,2})(?:[.,]5)?\s*(?:sob[aen]?|spava[ćc]|zimmer|schlafzimmer|rooms?|bedrooms?)/i;

export function extractRooms(text: string): number | null {
  const m = ROOM_RE.exec(text);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 20) return n;
  }
  for (const [re, n] of ROOM_WORDS) if (re.test(text)) return n;
  return null;
}

const YEAR_RE =
  /(?:god(?:in[aeu])?\.?\s*(?:iz)?gradnje|sagra[dđ]en[ao]?|izgra[dđ]en[ao]?|baujahr|gebaut|built\s*(?:in)?)\D{0,12}(19\d{2}|20\d{2})/i;
const YEAR_RE_POST = /(19\d{2}|20\d{2})\.?\s*(?:god(?:in[ae])?\.?|g\.)\s*(?:iz)?gradnje/i;

export function extractYearBuilt(text: string): number | null {
  const m = YEAR_RE.exec(text) ?? YEAR_RE_POST.exec(text);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const now = new Date().getFullYear();
  return y >= 1900 && y <= now + 2 ? y : null;
}
