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
    const priceOk =
      (l.priceEur >= LAND.hard.priceMin && l.priceEur <= LAND.hard.priceMax) ||
      (l.pricePerM2 != null && l.pricePerM2 <= LAND.hard.pricePerM2Max);
    const zoningOk = (l.zoning ?? "").toLowerCase().includes(LAND.hard.zoningContains);
    return isAllowedPlace(l.locationRaw) && zoningOk && priceOk;
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
