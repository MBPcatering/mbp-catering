import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { persistQuoteRequest } = vi.hoisted(() => ({
  persistQuoteRequest: vi.fn(),
}));

const { afterCallbacks, dispatchN8nWorker } = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => void | Promise<void>>,
  dispatchN8nWorker: vi.fn(),
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");

  return {
    ...actual,
    after: (callback: () => void | Promise<void>) => afterCallbacks.push(callback),
  };
});

vi.mock("@/lib/lead-persistence", () => ({
  persistQuoteRequest,
  SubmissionPersistenceError: class SubmissionPersistenceError extends Error {},
}));

vi.mock("@/lib/n8n-dispatch", () => ({ dispatchN8nWorker }));

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
    persistQuoteRequest.mockResolvedValue({
      reference: "MBP-2026-00000001",
      duplicate: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    afterCallbacks.length = 0;
    vi.clearAllMocks();
    delete process.env.QUOTE_RECEIPT_EMAIL_ENABLED;
  });

  it("persists a normal request without urgency", async () => {
    const response = await postQuote(validRequest);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      reference: "MBP-2026-00000001",
      receiptEmailEnabled: false,
    });
    expect(persistQuoteRequest).toHaveBeenCalledWith(
      expect.objectContaining({ isUrgent: false, urgentReason: null }),
      expect.any(Object),
    );
  });

  it("keeps the receipt disabled when its server flag is explicitly false", async () => {
    process.env.QUOTE_RECEIPT_EMAIL_ENABLED = "false";

    const response = await postQuote(validRequest);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      reference: "MBP-2026-00000001",
      receiptEmailEnabled: false,
    });
    expect(persistQuoteRequest).toHaveBeenCalledWith(
      expect.objectContaining({ receiptEnabled: false }),
      expect.any(Object),
    );
  });

  it("schedules a staging wake-up after an original request has been persisted", async () => {
    const response = await postQuote(validRequest);

    expect(response.status).toBe(201);
    expect(dispatchN8nWorker).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);

    await afterCallbacks[0]();

    expect(dispatchN8nWorker).toHaveBeenCalledWith("staging");
  });

  it("creates and wakes a receipt only when its server-side flag is enabled", async () => {
    process.env.QUOTE_RECEIPT_EMAIL_ENABLED = "true";

    const response = await postQuote({ ...validRequest, locale: "nl" });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      reference: "MBP-2026-00000001",
      receiptEmailEnabled: true,
    });
    expect(persistQuoteRequest).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "nl", receiptEnabled: true }),
      expect.any(Object),
    );
    expect(afterCallbacks).toHaveLength(1);

    await afterCallbacks[0]();

    expect(dispatchN8nWorker).toHaveBeenNthCalledWith(1, "staging");
    expect(dispatchN8nWorker).toHaveBeenNthCalledWith(2, "receipt");
  });

  it("does not schedule a second wake-up for an idempotent duplicate", async () => {
    persistQuoteRequest.mockResolvedValueOnce({
      reference: "MBP-2026-00000001",
      duplicate: true,
    });

    const response = await postQuote(validRequest);

    expect(response.status).toBe(201);
    expect(afterCallbacks).toHaveLength(0);
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
