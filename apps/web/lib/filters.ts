// Hard-Filter je Vertical (SPEC §5, finale Regeln). True = bleibt drin.
// Preis-Kriterien rechnen mit displayPriceEur (Fake-Preis-Erkennung, SPEC §9), Fallback priceEur.
import type { NormalizedListing } from "./normalize/types";
import { isAllowedPlace, HOUSE, LAND, CAR } from "./config";

export function passesHardFilter(l: NormalizedListing): boolean {
  const price = l.displayPriceEur ?? l.priceEur;

  if (l.vertical === "house") {
    // "Preis auf Anfrage": Preisband nicht prüfbar -> Inserat behalten und anzeigen (SPEC §9)
    const priceOk =
      l.priceOnRequest === true || (price >= HOUSE.hard.priceMin && price <= HOUSE.hard.priceMax);
    return (
      isAllowedPlace(l.locationRaw) &&
      priceOk &&
      (l.areaLivingM2 ?? 0) >= HOUSE.hard.areaLivingM2Min &&
      // rooms >= 3 ist Hard — aber nur pruefen, wenn die Quelle die Zimmerzahl liefert;
      // fehlende Angabe soll gute Haeuser nicht rauswerfen (Portale sind lueckenhaft)
      (l.rooms == null || l.rooms >= HOUSE.hard.roomsMin)
    );
  }

  if (l.vertical === "land") {
    const priceOk =
      l.priceOnRequest === true ||
      (price >= LAND.hard.priceMin && price <= LAND.hard.priceMax) ||
      (l.pricePerM2 != null && l.pricePerM2 <= LAND.hard.pricePerM2Max);
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
      price >= CAR.hard.priceMin &&
      price <= CAR.hard.priceMax &&
      (l.firstRegistrationYear ?? 0) >= CAR.hard.firstRegistrationYearMin &&
      l.transmission === CAR.hard.transmission &&
      (l.powerPs ?? 0) >= CAR.hard.powerPsMin &&
      (l.mileageKm ?? Infinity) <= CAR.hard.mileageKmMax &&
      // null-tolerant: AS24/mobile.de sind per Such-Radius vorgefiltert,
      // AutoHero liefert frei Haus (kein Fahrzeug-Standort)
      (l.distanceFromIsmaningKm == null ||
        l.distanceFromIsmaningKm <= CAR.hard.distanceFromIsmaningKmMax) &&
      fuelOk
    );
  }

  return false;
}
