// /settings — Filter-Grenzen und Score-Gewichte justieren (Feedback Ante 07/2026).
// Server-Seite lädt Defaults + gespeicherte Overrides; Speichern rescort alles.
import { WEIGHTS } from "@/lib/config";
import {
  FILTER_DEFAULTS,
  FILTER_LABELS,
  WEIGHT_LABELS,
  getEffectiveSettings,
} from "@/lib/settings";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Server Action rescort den ganzen Bestand

export default async function SettingsPage() {
  const { weightOverrides, filterOverrides } = await getEffectiveSettings();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Listing Radar</p>
      <h1 className="mt-1 font-heading text-4xl tracking-tight">Einstellungen</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Änderungen wirken sofort auf den gesamten Bestand: Beim Speichern werden alle Inserate
        neu gefiltert und neu bewertet. Neue Scraper-Läufe verwenden die Einstellungen ebenfalls.
      </p>
      <SettingsForm
        weightDefaults={JSON.parse(JSON.stringify(WEIGHTS))}
        filterDefaults={JSON.parse(JSON.stringify(FILTER_DEFAULTS))}
        weightLabels={WEIGHT_LABELS}
        filterLabels={FILTER_LABELS}
        initialWeights={weightOverrides}
        initialFilters={filterOverrides}
      />
    </main>
  );
}
