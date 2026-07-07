// lib/ai/image-review.ts — KI-Bildbewertung für Häuser + Grundstücke (SPEC §9).
// Modellwahl: SPEC §9 verlangt das GÜNSTIGSTE ausreichende vision-fähige Modell
// (Budget 5-10 €/Monat gesamt) -> claude-haiku-4-5 ($1/M Input, $5/M Output).
// Structured Outputs (output_config.format) garantieren valides JSON.
// Prompt-Caching lohnt hier nicht: Haiku cached erst ab 4096 Token Präfix,
// unser System-Prompt liegt weit darunter.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5";
const MAX_IMAGES = 5; // Kostenkontrolle (SPEC §9): nur die ersten N Bilder

export interface ImageReview {
  aiImageScore: number; // 0-100
  aiImageNotes: string; // kurz, deutsch
  hasSeaViewLikely: boolean;
  looksLikeTouristRental: boolean;
  renovationNeeded: "none" | "light" | "moderate" | "heavy" | "unknown";
}

const SYSTEM_PROMPT = `Du bewertest Immobilien-Inserate (Umgebung Zadar, Kroatien) anhand ihrer Fotos für einen privaten Hauskäufer (normales Wohnhaus zum Selbstbewohnen, kein Renditeobjekt).

Bewerte nüchtern und kritisch:
- Zustand, Modernität, sichtbare Renovierungen, Licht, Lage-Eindruck
- Bei Grundstücken: Lage, Zuschnitt, Bewuchs, Hanglage (Hanglage ist ein Minus)
- aiImageScore: 0-100 (50 = durchschnittlich; >80 nur bei wirklich gutem Eindruck)
- aiImageNotes: 1-2 kurze deutsche Sätze mit dem Wesentlichen (auch Warnsignale)
- hasSeaViewLikely: Zeigen Fenster-/Balkon-/Terrassen-/Grundstücksfotos erkennbar Meer oder Küstenlinie?
- looksLikeTouristRental: Wirkt es wie ein auf Ferienvermietung ausgelegtes Objekt (resortartiger Pool, unpersönliche Hotel-Optik, Apartment-Aufteilung)? Bei Grundstücken: false.
- renovationNeeded: Renovierungsbedarf anhand Zustand/Alter von Küche/Bad/Fassade ("none"/"light"/"moderate"/"heavy"; "unknown" wenn nicht einschätzbar oder Grundstück).

Zusätzliche Hinweise aus Titel/Beschreibung einbeziehen (z. B. "potrebna renovacija" = renovierungsbedürftig, "apartmani"/"turistički" = Vermietungsobjekt).`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    aiImageScore: { type: "integer", description: "0-100" },
    aiImageNotes: { type: "string" },
    hasSeaViewLikely: { type: "boolean" },
    looksLikeTouristRental: { type: "boolean" },
    renovationNeeded: { type: "string", enum: ["none", "light", "moderate", "heavy", "unknown"] },
  },
  required: [
    "aiImageScore",
    "aiImageNotes",
    "hasSeaViewLikely",
    "looksLikeTouristRental",
    "renovationNeeded",
  ],
  additionalProperties: false,
} as const;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt.");
  client ??= new Anthropic();
  return client;
}

/** Bewertet ein Inserat anhand seiner Bild-URLs (+ Titel/Beschreibung als Kontext). */
export async function reviewListingImages(input: {
  vertical: "house" | "land";
  title: string;
  description?: string | null;
  imageUrls: string[];
}): Promise<ImageReview> {
  const images = input.imageUrls.slice(0, MAX_IMAGES);
  if (images.length === 0) throw new Error("Keine Bilder vorhanden.");

  const content: Anthropic.ContentBlockParam[] = [
    ...images.map(
      (url): Anthropic.ContentBlockParam => ({
        type: "image",
        source: { type: "url", url },
      }),
    ),
    {
      type: "text",
      text: `Typ: ${input.vertical === "house" ? "Haus" : "Baugrundstück"}\nTitel: ${input.title}${
        input.description ? `\nBeschreibung: ${input.description.slice(0, 1500)}` : ""
      }`,
    },
  ];

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: {
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") throw new Error("Modell hat die Bewertung abgelehnt.");
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error(`Keine Text-Antwort (stop_reason: ${response.stop_reason}).`);

  const parsed = JSON.parse(text) as ImageReview;
  // Schema erlaubt keine min/max-Constraints -> clientseitig klemmen
  parsed.aiImageScore = Math.max(0, Math.min(100, Math.round(parsed.aiImageScore)));
  return parsed;
}
