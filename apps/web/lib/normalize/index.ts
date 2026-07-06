import type { Source, NormalizedListing } from "./types";
import { normalizeNjuskalo } from "./njuskalo";
import { normalizeAutoscout24 } from "./autoscout24";
import { normalizeMobilede } from "./mobilede";

/** Wählt den passenden Normalizer je Quelle. Null = Item überspringen. */
export function normalizeItem(source: Source, raw: unknown): NormalizedListing | null {
  switch (source) {
    case "njuskalo":
      return normalizeNjuskalo(raw as Record<string, unknown>);
    case "autoscout24":
      return normalizeAutoscout24(raw as Record<string, unknown>);
    case "mobilede":
      return normalizeMobilede(raw as Record<string, unknown>);
    // indexoglasi / autohero -> eigene Crawlee-Actors (Phase 8)
    default:
      return null;
  }
}
