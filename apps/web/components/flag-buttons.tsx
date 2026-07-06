"use client";

// Flag-Buttons (Favorit / raus / gesehen) — gemeinsam für alle Nutzer (SPEC §2/§11).
import { useTransition, useOptimistic } from "react";
import { toggleFlag } from "@/app/actions";

export interface Flags {
  favorite: boolean;
  hidden: boolean;
  seen: boolean;
}

const BUTTONS: Array<{ field: keyof Flags; on: string; off: string; title: string }> = [
  { field: "favorite", on: "★ Favorit", off: "☆ Favorit", title: "Als Favorit markieren" },
  { field: "seen", on: "✓ Gesehen", off: "Gesehen", title: "Als gesehen markieren" },
  { field: "hidden", on: "Raus ✕", off: "Raus", title: "Ausblenden (raus)" },
];

export function FlagButtons({
  listingId,
  flags,
  compact = false,
}: {
  listingId: string;
  flags: Flags;
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(flags);

  const onToggle = (field: keyof Flags) => {
    startTransition(async () => {
      setOptimistic({ ...optimistic, [field]: !optimistic[field] });
      await toggleFlag(listingId, field);
    });
  };

  return (
    <div className={`flex flex-wrap gap-1.5 ${pending ? "opacity-60" : ""}`}>
      {BUTTONS.map((b) => {
        const active = optimistic[b.field];
        return (
          <button
            key={b.field}
            type="button"
            title={b.title}
            onClick={() => onToggle(b.field)}
            className={`rounded-full px-2.5 ${compact ? "py-0.5 text-[11px]" : "py-1 text-xs"} font-medium ring-1 transition-colors ${
              active
                ? b.field === "hidden"
                  ? "bg-destructive/12 text-destructive ring-destructive/30"
                  : "bg-primary/12 text-primary ring-primary/30"
                : "bg-card text-muted-foreground ring-border hover:text-foreground"
            }`}
          >
            {active ? b.on : b.off}
          </button>
        );
      })}
    </div>
  );
}
