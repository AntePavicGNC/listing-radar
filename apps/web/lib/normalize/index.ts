import type { Source, NormalizedListing } from "./types";
import { normalizeNjuskalo } from "./njuskalo";

/** Wählt den passenden Normalizer je Quelle. Null = Item überspringen. */
export function normalizeItem(source: Source, raw: unknown): NormalizedListing | null {
  switch (source) {
    case "njuskalo":
      return normalizeNjuskalo(raw as Record<string, unknown>);
    // indexoglasi / autoscout24 / mobilede -> folgen in späteren Meilensteinen
    default:
      return null;
  }
}
