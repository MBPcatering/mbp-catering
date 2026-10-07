import { describe, expect, it } from "vitest";
import { quoteRequestSchema } from "./quote-request";

describe("quoteRequestSchema", () => {
  it("accepts the fields required to store a qualified lead", () => {
    const result = quoteRequestSchema.safeParse({
      requestType: "b2b", eventDate: "2026-11-15", eventTime: "12:30", guestCount: 18,
      address: "Rue de la Loi 16, 1000 Bruxelles", service: "Buffet", delivery: "delivery",
      notes: "Option végétarienne", firstName: "Marie", lastName: "Dupont", company: "Exemple SA",
      email: "marie@example.be", consent: true,
    });
    expect(result.success).toBe(true);
  });
});
