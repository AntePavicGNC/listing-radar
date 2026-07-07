// Hard-Filter je Vertical (SPEC §5, finale Regeln). True = bleibt drin.
// Preis-Kriterien rechnen mit displayPriceEur (Fake-Preis-Erkennung, SPEC §9), Fallback priceEur.
// Numerische Grenzen sind über /settings justierbar (lib/settings.ts, Defaults aus config.ts).
import type { NormalizedListing } from "./normalize/types";
import { isAllowedPlace, CAR } from "./config";
import { FILTER_DEFAULTS, type EffectiveFilters } from "./settings";

export function passesHardFilter(
  l: NormalizedListing,
  f: EffectiveFilters = FILTER_DEFAULTS as unknown as EffectiveFilters,
): boolean {
  const price = l.displayPriceEur ?? l.priceEur;

  if (l.vertical === "house") {
    // "Preis auf Anfrage": Preisband nicht prüfbar -> Inserat behalten und anzeigen (SPEC §9)
    const priceOk =
      l.priceOnRequest === true || (price >= f.house.priceMin && price <= f.house.priceMax);
    return (
      isAllowedPlace(l.locationRaw) &&
      priceOk &&
      (l.areaLivingM2 ?? 0) >= f.house.areaLivingM2Min &&
      // rooms-Minimum ist Hard — aber nur pruefen, wenn die Quelle die Zimmerzahl liefert;
      // fehlende Angabe soll gute Haeuser nicht rauswerfen (Portale sind lueckenhaft)
      (l.rooms == null || l.rooms >= f.house.roomsMin)
    );
  }

  if (l.vertical === "land") {
    const priceOk =
      l.priceOnRequest === true ||
      (price >= f.land.priceMin && price <= f.land.priceMax) ||
      (l.pricePerM2 != null && l.pricePerM2 <= f.land.pricePerM2Max);
    // Raus NUR, wenn eindeutig KEIN Baugrund (Zonierung genannt und nicht bestätigt).
    // Ohne Zonierungs-Angabe: behalten, Abwertung passiert im Score (SPEC §5/§9).
    const clearlyNotBuildingLand =
      l.zoningStated === true && l.zoningConfirmedBuildingLand === false;
    return isAllowedPlace(l.locationRaw) && !clearlyNotBuildingLand && priceOk;
  }

  if (l.vertical === "car") {
    // Kraftstoff ist Hard: reiner Benziner raus; Elektro nur mit >= 500 km Reichweite
    const fuelOk =
      l.fuel != null &&
      (CAR.hard.allowedFuels as readonly string[]).includes(l.fuel) &&
      (l.fuel !== "electric" || (l.rangeKm ?? 0) >= CAR.hard.electricMinRangeKm);
    return (
      price >= f.car.priceMin &&
      price <= f.car.priceMax &&
      (l.firstRegistrationYear ?? 0) >= f.car.firstRegistrationYearMin &&
      l.transmission === CAR.hard.transmission &&
      (l.powerPs ?? 0) >= f.car.powerPsMin &&
      (l.mileageKm ?? Infinity) <= f.car.mileageKmMax &&
      // null-tolerant: AS24/mobile.de sind per Such-Radius vorgefiltert,
      // AutoHero liefert frei Haus (kein Fahrzeug-Standort)
      (l.distanceFromIsmaningKm == null ||
        l.distanceFromIsmaningKm <= f.car.distanceFromIsmaningKmMax) &&
      fuelOk
    );
  }

  return false;
}
