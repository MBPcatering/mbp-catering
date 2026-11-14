import { describe, expect, it, vi } from "vitest";
import {
  LeadPersistenceClient,
  persistCatalogueDownload,
  persistQuoteRequest,
  SubmissionPersistenceError,
} from "./lead-persistence";

const context = {
  idempotencyKey: "quote-request-2026-0001",
  sourceFingerprint: "a".repeat(64),
};

const quoteRequest = {
  requestType: "b2b" as const,
  eventDate: "2026-11-15",
  eventTime: "lunch",
  guestCount: 18,
  address: "Rue de la Loi 16, 1000 Bruxelles",
  services: ["buffet"],
  delivery: "delivery" as const,
  firstName: "Marie",
  lastName: "Dupont",
  phone: "+32470000000",
  email: "marie@example.be",
  consent: true as const,
};

function clientReturning(result: unknown): LeadPersistenceClient {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  };
}

describe("lead persistence", () => {
  it("persists a quote and its automation outbox event through one RPC", async () => {
    const client = clientReturning({
      data: [
        {
          reference: "MBP-2026-00000001",
          automation_event_id: "27b94043-0a33-4ee2-8ccd-46216dc26444",
          duplicate: false,
        },
      ],
      error: null,
    });

    await expect(
      persistQuoteRequest(quoteRequest, context, client),
    ).resolves.toEqual({
      reference: "MBP-2026-00000001",
      automationEventId: "27b94043-0a33-4ee2-8ccd-46216dc26444",
      duplicate: false,
    });

    expect(client.rpc).toHaveBeenCalledWith("create_quote_request_with_event", {
      p_idempotency_key: context.idempotencyKey,
      p_request: {
        ...quoteRequest,
        isUrgent: false,
        urgentReason: null,
      },
      p_source_fingerprint: context.sourceFingerprint,
    });
  });

  it("persists a server-derived urgency marker with the quote request", async () => {
    const client = clientReturning({
      data: [
        {
          reference: "MBP-2026-00000002",
          automation_event_id: "dcb21649-fc31-4816-9a41-4c9b3f35c079",
          duplicate: false,
        },
      ],
      error: null,
    });

    await persistQuoteRequest(
      {
        ...quoteRequest,
        isUrgent: true,
        urgentReason: "notice_period",
      },
      context,
      client,
    );

    expect(client.rpc).toHaveBeenCalledWith("create_quote_request_with_event", {
      p_idempotency_key: context.idempotencyKey,
      p_request: {
        ...quoteRequest,
        isUrgent: true,
        urgentReason: "notice_period",
      },
      p_source_fingerprint: context.sourceFingerprint,
    });
  });

  it("preserves the quote RPC's idempotent duplicate result", async () => {
    const client = clientReturning({
      data: [
        {
          reference: "MBP-2026-00000001",
          automation_event_id: "27b94043-0a33-4ee2-8ccd-46216dc26444",
          duplicate: true,
        },
      ],
      error: null,
    });

    await expect(
      persistQuoteRequest(quoteRequest, context, client),
    ).resolves.toMatchObject({
      duplicate: true,
      reference: "MBP-2026-00000001",
    });
  });

  it("returns the original result when Supabase reports an idempotent duplicate", async () => {
    const client = clientReturning({
      data: [
        {
          reference: "CAT-2026-00000001",
          automation_event_id: "0b5fa4b2-d2f4-4d1a-9f17-18ee45f42cb9",
          duplicate: true,
        },
      ],
      error: null,
    });

    await expect(
      persistCatalogueDownload(
        {
          firstName: "Marie",
          lastName: "Dupont",
          phone: "+32470000000",
          email: "marie@example.be",
          consent: true,
        },
        context,
        client,
      ),
    ).resolves.toMatchObject({
      duplicate: true,
      reference: "CAT-2026-00000001",
    });
  });

  it("maps database rate limiting to a safe domain error", async () => {
    const client = clientReturning({
      data: null,
      error: { code: "P0001", message: "RATE_LIMITED" },
    });

    await expect(
      persistQuoteRequest(quoteRequest, context, client),
    ).rejects.toMatchObject({
      reason: "rate_limited",
    } satisfies Partial<SubmissionPersistenceError>);
  });

  it("does not expose unexpected Supabase failures", async () => {
    const client = clientReturning({
      data: null,
      error: { code: "XX000", message: "connection refused" },
    });

    await expect(
      persistQuoteRequest(quoteRequest, context, client),
    ).rejects.toMatchObject({
      reason: "unavailable",
    } satisfies Partial<SubmissionPersistenceError>);
  });
});
