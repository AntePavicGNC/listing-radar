"use client";

// Push-Opt-in (SPEC §11): registriert den Service Worker und abonniert Web Push
// pro Gerät/Browser. Dezenter Button auf der Startseite.
import { useEffect, useState } from "react";

type State = "unsupported" | "default" | "subscribed" | "denied" | "working";

function base64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushOptIn() {
  const [state, setState] = useState<State>("working");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "subscribed" : "default"))
      .catch(() => setState("unsupported"));
  }, []);

  const subscribe = async () => {
    setState("working");
    try {
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await fetch("/api/push").then((r) => r.json());
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast: TS 5.9 verlangt BufferSource, Uint8Array ist zur Laufzeit gültig
        applicationServerKey: base64ToUint8Array(publicKey) as unknown as BufferSource,
      });
      await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setState("subscribed");
    } catch {
      setState(Notification.permission === "denied" ? "denied" : "default");
    }
  };

  if (state === "unsupported") return null;
  if (state === "subscribed") {
    return (
      <p className="text-xs text-muted-foreground">
        🔔 Push aktiv — du bekommst neue Treffer und Preissenkungen.
      </p>
    );
  }
  if (state === "denied") {
    return (
      <p className="text-xs text-muted-foreground">
        Push blockiert — in den Browser-Einstellungen erlauben, falls gewünscht.
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={subscribe}
      disabled={state === "working"}
      className="rounded-full bg-card px-3 py-1.5 text-xs font-medium ring-1 ring-border transition-colors hover:text-foreground text-muted-foreground disabled:opacity-50"
    >
      🔔 Benachrichtigungen aktivieren (neue Treffer, Preissenkungen)
    </button>
  );
}
