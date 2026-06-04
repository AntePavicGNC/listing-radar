// lib/geo.ts — Geo-Hilfen.
import { ISMANING } from "./config";

/** Entfernung zwischen zwei Koordinaten in km (Haversine). */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Entfernung eines Punktes von Ismaning in km (gerundet) — oder undefined ohne Koordinaten. */
export function distanceFromIsmaningKm(
  lat?: number | null,
  lng?: number | null,
): number | undefined {
  if (lat == null || lng == null) return undefined;
  return Math.round(haversineKm(ISMANING.lat, ISMANING.lng, lat, lng));
}
