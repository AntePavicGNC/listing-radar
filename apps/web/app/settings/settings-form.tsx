"use client";

// Formular für Gewichte + Filter. Zeigt Default als Platzhalter; leeres Feld
// = Default verwenden. "Speichern & neu berechnen" rescort den ganzen Bestand.
import { useState, useTransition } from "react";
import { saveSettings, type SaveSettingsResult } from "./actions";

type Vertical = "house" | "land" | "car";
type NumMap = Record<string, number>;
type Overrides = Partial<Record<Vertical, NumMap>>;

export interface SettingsFormProps {
  weightDefaults: Record<Vertical, NumMap>;
  filterDefaults: Record<Vertical, NumMap>;
  weightLabels: Record<Vertical, Array<{ key: string; label: string }>>;
  filterLabels: Record<Vertical, Array<{ key: string; label: string; unit?: string }>>;
  initialWeights: Overrides;
  initialFilters: Overrides;
}

const VERTICAL_TITLES: Record<Vertical, string> = {
  house: "Häuser",
  land: "Grundstücke",
  car: "Autos",
};

function Field({
  label,
  unit,
  defaultValue,
  value,
  onChange,
}: {
  label: string;
  unit?: string;
  defaultValue: number;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  const overridden = value != null && value !== defaultValue;
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-foreground/80">
        {label}
        {overridden ? <span className="ml-1.5 text-xs font-medium text-primary">geändert</span> : null}
      </span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min={0}
          className="w-28 rounded-lg border border-border bg-card px-2.5 py-1.5 text-right text-sm tabular-nums outline-none focus:border-primary"
          placeholder={String(defaultValue)}
          value={value ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return onChange(undefined);
            const n = Number(raw);
            onChange(Number.isFinite(n) ? n : undefined);
          }}
        />
        {unit ? <span className="w-9 text-xs text-muted-foreground">{unit}</span> : <span className="w-9" />}
      </span>
    </label>
  );
}

export function SettingsForm(props: SettingsFormProps) {
  const [weights, setWeights] = useState<Overrides>(props.initialWeights);
  const [filters, setFilters] = useState<Overrides>(props.initialFilters);
  const [result, setResult] = useState<SaveSettingsResult | null>(null);
  const [pending, startTransition] = useTransition();

  const setVal =
    (setter: typeof setWeights, v: Vertical, key: string) => (value: number | undefined) =>
      setter((prev) => {
        const next = { ...prev, [v]: { ...(prev[v] ?? {}) } as NumMap };
        if (value == null) delete next[v]![key];
        else next[v]![key] = value;
        if (Object.keys(next[v]!).length === 0) delete next[v];
        return next;
      });

  const submit = () =>
    startTransition(async () => {
      setResult(null);
      const r = await saveSettings(weights, filters);
      setResult(r);
    });

  const reset = () =>
    startTransition(async () => {
      setWeights({});
      setFilters({});
      setResult(null);
      const r = await saveSettings({}, {});
      setResult(r);
    });

  return (
    <div>
      <section className="mt-8">
        <h2 className="font-heading text-2xl tracking-tight">Hard-Filter</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Inserate außerhalb dieser Grenzen fliegen komplett raus. Leeres Feld = Standardwert
          (steht als Platzhalter im Feld).
        </p>
        <div className="mt-4 grid gap-5 lg:grid-cols-3">
          {(Object.keys(VERTICAL_TITLES) as Vertical[]).map((v) => (
            <div key={v} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
              <h3 className="font-medium">{VERTICAL_TITLES[v]}</h3>
              <div className="mt-2 divide-y divide-border/60">
                {props.filterLabels[v].map((f) => (
                  <Field
                    key={f.key}
                    label={f.label}
                    unit={f.unit}
                    defaultValue={props.filterDefaults[v][f.key]}
                    value={filters[v]?.[f.key]}
                    onChange={setVal(setFilters, v, f.key)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-heading text-2xl tracking-tight">Score-Gewichte</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Wie stark ein Kriterium in den Gesamt-Score (0–100) einfließt. Höher = wichtiger.
          Der Score ist der gewichtete Schnitt aller Kriterien, zu denen Daten vorliegen.
        </p>
        <div className="mt-4 grid gap-5 lg:grid-cols-3">
          {(Object.keys(VERTICAL_TITLES) as Vertical[]).map((v) => (
            <div key={v} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
              <h3 className="font-medium">{VERTICAL_TITLES[v]}</h3>
              <div className="mt-2 divide-y divide-border/60">
                {props.weightLabels[v].map((f) => (
                  <Field
                    key={f.key}
                    label={f.label}
                    defaultValue={props.weightDefaults[v][f.key]}
                    value={weights[v]?.[f.key]}
                    onChange={setVal(setWeights, v, f.key)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="sticky bottom-4 mt-8 flex flex-wrap items-center gap-3 rounded-2xl bg-card/95 p-4 ring-1 ring-foreground/10 backdrop-blur">
        <button
          onClick={submit}
          disabled={pending}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Speichern & neu berechnen …" : "Speichern & alle Scores neu berechnen"}
        </button>
        <button
          onClick={reset}
          disabled={pending}
          className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          Alles auf Standard zurücksetzen
        </button>
        {pending ? (
          <span className="text-sm text-muted-foreground">
            Kann bis zu einer Minute dauern (alle Inserate werden neu bewertet) …
          </span>
        ) : null}
        {result?.ok ? (
          <span className="text-sm text-primary">
            Gespeichert — {result.rescored} neu bewertet
            {result.dropped ? `, ${result.dropped} fallen jetzt raus` : ""}
            {result.revived ? `, ${result.revived} wieder aufgenommen` : ""}.
          </span>
        ) : null}
        {result && !result.ok ? (
          <span className="text-sm text-destructive">Fehler: {result.error}</span>
        ) : null}
      </div>
    </div>
  );
}
