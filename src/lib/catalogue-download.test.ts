import { describe, expect, it } from "vitest";
import { catalogueDownloadSchema } from "./catalogue-download";

describe("catalogueDownloadSchema", () => {
  it("requires the contact details and consent before issuing a download", () => {
    const result = catalogueDownloadSchema.safeParse({
      firstName: "Marie",
      lastName: "Dupont",
      company: "Exemple SA",
      email: "marie@example.be",
      phone: "+32470000000",
      consent: true,
    });

    expect(result.success).toBe(true);
  });
});
