import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { persistQuoteRequest } = vi.hoisted(() => ({
  persistQuoteRequest: vi.fn(),
}));

vi.mock("@/lib/lead-persistence", () => ({
  persistQuoteRequest,
  SubmissionPersistenceError: class SubmissionPersistenceError extends Error {},
}));

import { POST } from "./route";

const validRequest = {
  requestType: "b2b",
  eventDate: "2026-10-13",
  eventTime: "lunch",
  guestCount: 18,
  address: "Rue de la Loi 16, 1000 Bruxelles",
  services: ["buffet"],
  delivery: "delivery",
  firstName: "Marie",
  lastName: "Dupont",
  company: "Exemple SA",
  phone: "+32470000000",
  email: "marie@example.be",
  consent: true,
};

function postQuote(payload: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/quote-requests", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "quote-request-2026-0001",
      },
      body: JSON.stringify(payload),
    }),
  );
}

describe("POST /api/quote-requests", () => {
  beforeEach(() => {
    process.env.SUBMISSION_FINGERPRINT_SECRET = "test-fingerprint-secret";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T10:00:00Z"));
    persistQuoteRequest.mockResolvedValue({ reference: "MBP-2026-00000001" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("persists a normal request without urgency", async () => {
    const response = await postQuote(validRequest);

    expect(response.status).toBe(201);
    expect(persistQuoteRequest).toHaveBeenCalledWith(
      expect.objectContaining({ isUrgent: false, urgentReason: null }),
      expect.any(Object),
    );
  });

  it("derives notice-period urgency on the server", async () => {
    const response = await postQuote({
      ...validRequest,
      eventDate: "2026-10-08",
    });

    expect(response.status).toBe(201);
    expect(persistQuoteRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        isUrgent: true,
        urgentReason: "notice_period",
      }),
      expect.any(Object),
    );
  });

  it("ignores a client-supplied urgency marker", async () => {
    const response = await postQuote({
      ...validRequest,
      isUrgent: true,
      urgentReason: "notice_period",
    });

    expect(response.status).toBe(201);
    expect(persistQuoteRequest).toHaveBeenCalledWith(
      expect.objectContaining({ isUrgent: false, urgentReason: null }),
      expect.any(Object),
    );
  });

  it("rejects an invalid request before persistence", async () => {
    const response = await postQuote({ ...validRequest, guestCount: 9 });

    expect(response.status).toBe(422);
    expect(persistQuoteRequest).not.toHaveBeenCalled();
  });

  it("rejects a B2B request without a company before persistence", async () => {
    const response = await postQuote({ ...validRequest, company: "" });

    expect(response.status).toBe(400);
    expect(persistQuoteRequest).not.toHaveBeenCalled();
  });

});
