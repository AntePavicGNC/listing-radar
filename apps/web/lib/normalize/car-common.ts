// Gemeinsame Helfer für Auto-Normalizer (AutoScout24, mobile.de, später AutoHero).
import { createHash } from "node:crypto";
import type { BodyType, Fuel } from "./types";

export function makeId(source: string, sourceListingId: string): string {
  return createHash("sha256").update(`${source}:${sourceListingId}`).digest("hex").slice(0, 24);
}

export function toNum(x: unknown): number | null {
  const n = typeof x === "string" ? parseFloat(x.replace(/[^\d.,-]/g, "").replace(",", ".")) : typeof x === "number" ? x : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Ganzzahl aus Portal-Strings mit Tausendertrennern ("12,700 km" / "12.700 km" -> 12700).
 * Für km/Reichweite — NICHT für Dezimalwerte verwenden.
 */
export function toInt(x: unknown): number | null {
  if (typeof x === "number") return Number.isFinite(x) ? Math.round(x) : null;
  if (typeof x !== "string") return null;
  const digits = x.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/** ACC aus Ausstattungs-/Beschreibungstext erkennen (SPEC §5: bewusst tolerant, aber kein Kollisionswarner). */
export function detectAcc(text: string): boolean | null {
  if (!text) return null;
  return /adaptive\s*cruise|abstandstempomat|abstandsregeltempomat|distronic|active\s*cruise|travel\s*assist|driving\s*assistant\s*(plus|professional)|\bacc\b/i.test(
    text,
  )
    ? true
    : null; // false nie behaupten — Listen sind unvollständig
}

/** Einparkhilfe mit Kamera erkennen. */
export function detectParkingCamera(text: string): boolean | null {
  if (!text) return null;
  return /r[üu]ckfahrkamera|rear.?view\s*camera|360[°\s]*(kamera|camera|view)|surround\s*view|park.*(kamera|camera)|kamera.*einpark/i.test(
    text,
  )
    ? true
    : null;
}

/** Kraftstoff-Text auf unser Enum mappen. */
export function mapFuel(s: string | null | undefined): Fuel | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (t.includes("hybrid")) return t.includes("diesel") ? "hybrid_diesel" : "hybrid_petrol";
  if (t.includes("diesel")) return "diesel";
  if (t.includes("electr") || t.includes("elektr")) return "electric";
  if (t.includes("petrol") || t.includes("gasoline") || t.includes("benzin") || t.includes("super"))
    return "petrol";
  return "other";
}

/** Karosserie-Text auf unser Enum mappen (Coupé-SUV ist aus Portaldaten nicht ableitbar -> suv). */
export function mapBodyType(s: string | null | undefined): BodyType | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (t.includes("sedan") || t.includes("saloon") || t.includes("limousine")) return "limousine";
  if (t.includes("station") || t.includes("estate") || t.includes("kombi")) return "kombi";
  if (t.includes("offroad") || t.includes("off-road") || t.includes("suv")) return "suv";
  if (t.includes("compact") || t.includes("klein") || t.includes("hatch")) return "sportback";
  return "other";
}

/** HTML grob zu Text (Beschreibungen kommen teils als HTML). */
export function stripHtml(s: string | null | undefined): string | null {
  if (!s) return null;
  return s
    .replace(/<br\s*\/?>(?=.)/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
