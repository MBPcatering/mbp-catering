import { describe, expect, it } from "vitest";
import { createQuoteFormDraft, prepareQuoteRequestPayload } from "./quote-form-flow";
import { quoteRequestSchema } from "./quote-request";

describe("quoteRequestSchema", () => {
  it("accepts the fields required to store a qualified lead", () => {
    const result = quoteRequestSchema.safeParse({
      requestType: "b2b",
      eventDate: "2026-11-15",
      eventTime: "12:30",
      guestCount: 18,
      address: "Rue de la Loi 16, 1000 Bruxelles",
      services: ["Buffet", "Poké bowls"],
      delivery: "delivery",
      notes: "Option végétarienne",
      firstName: "Marie",
      lastName: "Dupont",
      company: "Exemple SA",
      phone: "+32470000000",
      email: "marie@example.be",
      consent: true,
    });
    expect(result.success).toBe(true);
  });

  it("keeps older request payloads compatible while defaulting additional services", () => {
    const result = quoteRequestSchema.safeParse({
      requestType: "private",
      eventDate: "2026-11-15",
      guestCount: 18,
      address: "Rue de la Loi 16, 1000 Bruxelles",
      services: ["Buffet"],
      delivery: "delivery",
      firstName: "Marie",
      lastName: "Dupont",
      phone: "+32470000000",
      email: "marie@example.be",
      consent: true,
    });

    expect(result).toMatchObject({
      success: true,
      data: { additionalServices: [] },
    });
  });

  it("accepts validated optional event and additional-service fields", () => {
    const result = quoteRequestSchema.safeParse({
      requestType: "private",
      eventDate: "2026-11-15",
      eventType: "Anniversaire",
      guestCount: 18,
      address: "Rue de la Loi 16, 1000 Bruxelles",
      services: ["Buffet"],
      additionalServices: ["Personnel de service"],
      delivery: "delivery",
      firstName: "Marie",
      lastName: "Dupont",
      phone: "+32470000000",
      email: "marie@example.be",
      consent: true,
    });

    expect(result.success).toBe(true);
  });

  it("requires a phone number", () => {
    expect(
      quoteRequestSchema.safeParse({
        requestType: "b2b",
        eventDate: "2026-11-15",
        guestCount: 18,
        address: "Rue de la Loi 16, 1000 Bruxelles",
        service: "Buffet",
        delivery: "delivery",
        firstName: "Marie",
        lastName: "Dupont",
        email: "marie@example.be",
        consent: true,
      }).success,
    ).toBe(false);
  });

  it("rejects a B2B request without a company", () => {
    expect(
      quoteRequestSchema.safeParse({
        requestType: "b2b",
        eventDate: "2026-11-15",
        guestCount: 18,
        address: "Rue de la Loi 16, 1000 Bruxelles",
        services: ["Buffet"],
        delivery: "delivery",
        firstName: "Marie",
        lastName: "Dupont",
        company: "",
        phone: "+32470000000",
        email: "marie@example.be",
        consent: true,
      }).success,
    ).toBe(false);
  });

  it("accepts a private request without a company", () => {
    expect(
      quoteRequestSchema.safeParse({
        requestType: "private",
        eventDate: "2026-11-15",
        guestCount: 18,
        address: "Rue de la Loi 16, 1000 Bruxelles",
        services: ["Buffet"],
        delivery: "delivery",
        firstName: "Marie",
        lastName: "Dupont",
        phone: "+32470000000",
        email: "marie@example.be",
        consent: true,
      }).success,
    ).toBe(true);
  });

  it("accepts delivery only", () => {
    expect(
      quoteRequestSchema.safeParse({
        requestType: "b2b",
        eventDate: "2026-11-15",
        guestCount: 18,
        address: "Rue de la Loi 16, 1000 Bruxelles",
        services: ["Buffet"],
        delivery: "collection",
        firstName: "Marie",
        lastName: "Dupont",
        phone: "+32470000000",
        email: "marie@example.be",
        consent: true,
      }).success,
    ).toBe(false);
  });

  it("accepts the five-step form payload with catalogue IDs and delivery included", () => {
    const draft = {
      ...createQuoteFormDraft(),
      requestType: "b2b" as const,
      eventType: "business-lunch",
      eventDate: "2026-11-15",
      guestCount: 18,
      address: "Rue de la Loi 16, 1000 Bruxelles",
      services: ["buffets", "poke-bowls"],
      additionalServices: ["service-staff"],
      notes: "Option végétarienne",
      firstName: "Marie",
      lastName: "Dupont",
      company: "Exemple SA",
      phone: "+32470000000",
      email: "marie@example.be",
      consent: true,
    };

    expect(quoteRequestSchema.safeParse(prepareQuoteRequestPayload(draft))).toMatchObject({
      success: true,
      data: expect.objectContaining({
        delivery: "delivery",
        eventType: "business-lunch",
        additionalServices: ["service-staff"],
      }),
    });
  });

  it("keeps historical free-form catalogue values compatible", () => {
    const baseRequest = {
      requestType: "private",
      eventDate: "2026-11-15",
      guestCount: 18,
      address: "Rue de la Loi 16, 1000 Bruxelles",
      services: ["Legacy custom catering offer"],
      delivery: "delivery",
      firstName: "Marie",
      lastName: "Dupont",
      phone: "+32470000000",
      email: "marie@example.be",
      consent: true,
    };

    expect(quoteRequestSchema.safeParse(baseRequest).success).toBe(true);
  });
});
