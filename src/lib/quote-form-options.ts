export type QuoteFormOption = {
  value: string;
  labelKey: string;
};

export const quoteEventTypes: QuoteFormOption[] = [
  { value: "corporate-breakfast", labelKey: "eventTypeCorporateBreakfast" },
  { value: "meeting-seminar", labelKey: "eventTypeMeetingSeminar" },
  { value: "business-lunch", labelKey: "eventTypeBusinessLunch" },
  { value: "cocktail-reception", labelKey: "eventTypeCocktailReception" },
  { value: "corporate-dinner", labelKey: "eventTypeCorporateDinner" },
  { value: "private-event", labelKey: "eventTypePrivate" },
  { value: "other", labelKey: "eventTypeOther" },
];

export const quoteOffers: QuoteFormOption[] = [
  { value: "zakouskis", labelKey: "offerZakouskis" },
  { value: "filled-breads", labelKey: "offerFilledBreads" },
  { value: "spring-rolls", labelKey: "offerSpringRolls" },
  { value: "jars", labelKey: "offerJars" },
  { value: "hot-casseroles", labelKey: "offerHotCasseroles" },
  { value: "poke-bowls", labelKey: "offerPokeBowls" },
  { value: "buffets", labelKey: "offerBuffets" },
  { value: "cold-plates", labelKey: "offerColdPlates" },
  { value: "executive-dinners", labelKey: "offerExecutiveDinners" },
  { value: "breakfasts", labelKey: "offerBreakfasts" },
  { value: "custom", labelKey: "offerCustom" },
  { value: "undecided", labelKey: "offerUndecided" },
];

export const quoteAdditionalServices: QuoteFormOption[] = [
  { value: "service-staff", labelKey: "additionalServiceStaff" },
  { value: "other-needs", labelKey: "additionalServiceOther" },
];

export const deliveryValue = "delivery" as const;
