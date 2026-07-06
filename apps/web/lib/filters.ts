// Hard-Filter je Vertical (SPEC §5). True = bleibt drin, False = fliegt raus.
import type { NormalizedListing } from "./normalize/types";
import { isAllowedPlace, HOUSE, LAND, CAR } from "./config";

export function passesHardFilter(l: NormalizedListing): boolean {
  if (l.vertical === "house") {
    return (
      isAllowedPlace(l.locationRaw) &&
      l.priceEur >= HOUSE.hard.priceMin &&
      l.priceEur <= HOUSE.hard.priceMax &&
      (l.areaLivingM2 ?? 0) >= HOUSE.hard.areaLivingM2Min
    );
  }

  if (l.vertical === "land") {
    const price = l.displayPriceEur ?? l.priceEur;
    const priceOk =
      (price >= LAND.hard.priceMin && price <= LAND.hard.priceMax) ||
      (l.pricePerM2 != null && l.pricePerM2 <= LAND.hard.pricePerM2Max);
    // Raus NUR, wenn eindeutig KEIN Baugrund (Zonierung genannt und nicht bestätigt).
    // Ohne Zonierungs-Angabe: behalten, Abwertung passiert im Score (SPEC §5/§9).
    const clearlyNotBuildingLand =
      l.zoningStated === true && l.zoningConfirmedBuildingLand === false;
    return isAllowedPlace(l.locationRaw) && !clearlyNotBuildingLand && priceOk;
  }

  if (l.vertical === "car") {
    return (
      l.priceEur >= CAR.hard.priceMin &&
      l.priceEur <= CAR.hard.priceMax &&
      (l.firstRegistrationYear ?? 0) >= CAR.hard.firstRegistrationYearMin &&
      l.transmission === CAR.hard.transmission &&
      (l.powerPs ?? 0) >= CAR.hard.powerPsMin &&
      (l.mileageKm ?? Infinity) <= CAR.hard.mileageKmMax &&
      (l.distanceFromIsmaningKm ?? Infinity) <= CAR.hard.distanceFromIsmaningKmMax
    );
  }

  return false;
}
