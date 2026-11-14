import { describe, expect, it } from "vitest";
import { evaluateQuoteRequest } from "./quote-rules";

describe("evaluateQuoteRequest", () => {
  it("rejects an event date in the past", () => {
    expect(
      evaluateQuoteRequest(
        { requestType: "b2b", guestCount: 10, eventDate: "2026-10-06" },
        new Date("2026-10-07T10:00:00Z"),
      ),
    ).toEqual({
      status: "rejected",
      eligible: false,
      urgent: false,
      reason: "past-date",
    });
  });

  it("rejects a request below the ten-person minimum", () => {
    expect(
      evaluateQuoteRequest({
        requestType: "b2b",
        guestCount: 8,
        eventDate: "2099-01-08",
      }),
    ).toEqual({
      status: "rejected",
      eligible: false,
      urgent: false,
      reason: "minimum-guests",
    });
  });

  it("accepts a B2B request below the notice period as urgent", () => {
    expect(
      evaluateQuoteRequest(
        { requestType: "b2b", guestCount: 12, eventDate: "2026-10-08" },
        new Date("2026-10-07T10:00:00Z"),
      ),
    ).toEqual({
      status: "urgent",
      eligible: true,
      urgent: true,
      reason: "notice_period",
    });
  });

  it("accepts a private event booked five days ahead", () => {
    expect(
      evaluateQuoteRequest(
        { requestType: "private", guestCount: 10, eventDate: "2026-10-13" },
        new Date("2026-10-07T10:00:00Z"),
      ),
    ).toEqual({ status: "accepted", eligible: true, urgent: false });
  });

  it("accepts a B2B request exactly at the 48-hour threshold", () => {
    expect(
      evaluateQuoteRequest(
        { requestType: "b2b", guestCount: 10, eventDate: "2026-10-09" },
        new Date(2026, 9, 7, 23, 59, 59, 999),
      ),
    ).toEqual({ status: "accepted", eligible: true, urgent: false });
  });

  it("accepts a private request exactly at the five-day threshold", () => {
    expect(
      evaluateQuoteRequest(
        { requestType: "private", guestCount: 10, eventDate: "2026-10-12" },
        new Date(2026, 9, 7, 23, 59, 59, 999),
      ),
    ).toEqual({ status: "accepted", eligible: true, urgent: false });
  });

  it("marks a private request below the five-day threshold as urgent", () => {
    expect(
      evaluateQuoteRequest(
        { requestType: "private", guestCount: 10, eventDate: "2026-10-11" },
        new Date(2026, 9, 7, 23, 59, 59, 999),
      ),
    ).toEqual({
      status: "urgent",
      eligible: true,
      urgent: true,
      reason: "notice_period",
    });
  });
});
