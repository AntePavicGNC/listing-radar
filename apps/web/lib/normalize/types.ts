// Gemeinsames Zielschema, auf das jede Quelle gemappt wird (SPEC §4, finale Version).
// Muss deckungsgleich mit prisma/schema.prisma sein.
export type Source = "njuskalo" | "indexoglasi" | "autoscout24" | "mobilede" | "autohero";
export type Vertical = "house" | "land" | "car";
export type Fuel = "diesel" | "petrol" | "hybrid_petrol" | "hybrid_diesel" | "electric" | "other";
export type Transmission = "manual" | "automatic";
export type RenovationNeeded = "none" | "light" | "moderate" | "heavy";
export type InfotainmentGeneration = "latest" | "previous" | "older" | "unknown";
export type BodyType = "limousine" | "sportback" | "suv" | "suv_coupe" | "kombi" | "other";

/** Ein Plus-/Minuspunkt in der Score-Begründung (SPEC §4/§5). */
export interface ScoreReason {
  label: string; // z. B. "Preis pro m² sehr gut", "Ort eher schwach"
  points: number; // positiv oder negativ
}

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

  // Preis-Handling (SPEC §9) — wird im Enrichment gesetzt, Normalizer darf vorbelegen
  displayPriceEur?: number | null;
  priceOnRequest?: boolean;

  // Haus
  areaLivingM2?: number | null;
  areaPlotM2?: number | null;
  rooms?: number | null; // reine Wohnräume ohne Küche/Bad
  bathroomCount?: number | null;
  yearBuilt?: number | null;
  yearRenovated?: number | null;
  hasGarden?: boolean | null;
  hasPool?: boolean | null;
  hasAuxiliaryBuilding?: boolean | null;
  hasParkingSpot?: boolean | null;
  hasGarage?: boolean | null;
  hasAirConditioning?: boolean | null;
  heatingType?: string | null;
  renovationNeeded?: RenovationNeeded | null;
  hasSeaViewLikely?: boolean | null;
  looksLikeTouristRental?: boolean | null;
  pricePerLivingM2?: number | null;
  pricePerPlotM2?: number | null;

  // Grundstück
  zoningStated?: boolean | null;
  zoningConfirmedBuildingLand?: boolean | null;
  pricePerM2?: number | null;

  // Auto
  make?: string | null;
  model?: string | null;
  variant?: string | null;
  firstRegistrationYear?: number | null;
  firstRegistrationMonth?: number | null;
  mileageKm?: number | null;
  fuel?: Fuel | null;
  rangeKm?: number | null;
  transmission?: Transmission | null;
  powerPs?: number | null;
  bodyType?: BodyType | null;
  distanceFromIsmaningKm?: number | null;
  hasAdaptiveCruiseControl?: boolean | null;
  hasParkingCamera?: boolean | null;
  infotainmentGeneration?: InfotainmentGeneration | null;
  monthlyFinancingEur?: number | null;

  raw: unknown;
}
