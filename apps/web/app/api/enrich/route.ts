import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// KI-Anreicherung (SPEC §9): Bildbewertung (Haus/Grundstück), Fair-Preis-Schätzung,
// Auto-Recherche (Versicherung/Facelift), Infotainment-Erkennung.
// Die REGELBASIERTEN Anreicherungen (Fake-Preis, Zonierung) laufen bereits direkt
// im Ingest (lib/enrich.ts). Dieser Endpoint ist der Einstiegspunkt für die KI-Stufe
// und wird aktiv, sobald ANTHROPIC_API_KEY gesetzt ist.
export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "ANTHROPIC_API_KEY ist nicht gesetzt. KI-Anreicherung (Bildbewertung, Fair-Preis, Auto-Recherche) ist noch nicht aktiv — regelbasierte Anreicherung läuft bereits im Ingest.",
      },
      { status: 501 },
    );
  }
  // TODO (sobald Key vorhanden): Bildbewertung + Fair-Preis + Auto-Recherche + Infotainment.
  return NextResponse.json({ ok: false, error: "KI-Anreicherung noch nicht implementiert." }, { status: 501 });
}
