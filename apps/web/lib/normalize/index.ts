import type { Source, NormalizedListing } from "./types";
import { normalizeNjuskalo } from "./njuskalo";
import { normalizeAutoscout24 } from "./autoscout24";
import { normalizeMobilede } from "./mobilede";
import { normalizeAutohero } from "./autohero";
import { normalizeIndexOglasi } from "./indexoglasi";

/** Wählt den passenden Normalizer je Quelle. Null = Item überspringen. */
export function normalizeItem(source: Source, raw: unknown): NormalizedListing | null {
  switch (source) {
    case "njuskalo":
      return normalizeNjuskalo(raw as Record<string, unknown>);
    case "autoscout24":
      return normalizeAutoscout24(raw as Record<string, unknown>);
    case "mobilede":
      return normalizeMobilede(raw as Record<string, unknown>);
    case "autohero":
      return normalizeAutohero(raw as Record<string, unknown>);
    case "indexoglasi":
      return normalizeIndexOglasi(raw as Record<string, unknown>);
    default:
      return null;
  }
}
