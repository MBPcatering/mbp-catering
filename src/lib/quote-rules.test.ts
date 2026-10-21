import { describe, expect, it } from "vitest";
import { evaluateQuoteRequest } from "./quote-rules";

describe("evaluateQuoteRequest", () => {
  it("rejects an event date in the past", () => {
    expect(
      evaluateQuoteRequest(
        { requestType: "b2b", guestCount: 10, eventDate: "2026-10-06" },
        new Date("2026-10-07T10:00:00Z"),
      ),
    ).toMatchObject({ eligible: false, reason: "past-date" });
  });

  it("rejects a request below the ten-person minimum", () => {
    expect(
      evaluateQuoteRequest({
        requestType: "b2b",
        guestCount: 8,
        eventDate: "2099-01-08",
      }),
    ).toMatchObject({ eligible: false, reason: "minimum-guests" });
  });

  it("requires at least 48 hours for a B2B request", () => {
    expect(
      evaluateQuoteRequest(
        { requestType: "b2b", guestCount: 12, eventDate: "2026-10-08" },
        new Date("2026-10-07T10:00:00Z"),
      ),
    ).toMatchObject({ eligible: false, reason: "notice-period" });
  });

  it("accepts a private event booked five days ahead", () => {
    expect(
      evaluateQuoteRequest(
        { requestType: "private", guestCount: 10, eventDate: "2026-10-13" },
        new Date("2026-10-07T10:00:00Z"),
      ),
    ).toMatchObject({ eligible: true });
  });
});
