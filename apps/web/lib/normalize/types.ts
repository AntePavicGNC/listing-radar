// Gemeinsames Zielschema, auf das jede Quelle gemappt wird (SPEC §4).
export type Source = "njuskalo" | "indexoglasi" | "autoscout24" | "mobilede";
export type Vertical = "house" | "land" | "car";

export interface NormalizedListing {
  id: string; // Hash aus source + sourceListingId
  source: Source;
  sourceListingId: string;
  vertical: Vertical;
  url: string;
  title: string;
  priceEur: number;
  images: string[];
  description?: string | null;

  locationRaw: string;
  locationCity?: string | null;
  locationRegion?: string | null;
  lat?: number | null;
  lng?: number | null;
  postedAt?: Date | null;

  // Haus / Grundstück
  areaLivingM2?: number | null;
  areaPlotM2?: number | null;
  rooms?: number | null;
  yearBuilt?: number | null;
  yearRenovated?: number | null;
  hasGarden?: boolean | null;
  pricePerLivingM2?: number | null;
  zoning?: string | null;
  pricePerM2?: number | null;

  // Auto
  make?: string | null;
  model?: string | null;
  variant?: string | null;
  firstRegistrationYear?: number | null;
  firstRegistrationMonth?: number | null;
  mileageKm?: number | null;
  fuel?: "diesel" | "petrol" | "hybrid" | "electric" | "other" | null;
  transmission?: "manual" | "automatic" | null;
  powerPs?: number | null;
  bodyType?: string | null;
  distanceFromIsmaningKm?: number | null;

  raw: unknown;
}
