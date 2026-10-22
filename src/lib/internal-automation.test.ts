import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type AutomationRpcClient,
  handleInternalAutomationRequest,
} from "./internal-automation";

const automationSecret = "test-automation-secret";
const eventId = "1a804807-889a-419c-94ae-2e9df9a75fe0";
const lockToken = "e4f47f3d-f8c9-4b12-a70a-c916edc95b2a";

function createRequest(path: string, body: unknown, token = automationSecret) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function createClient(data: unknown, error: unknown = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ data, error }),
  } satisfies AutomationRpcClient;
}

describe("handleInternalAutomationRequest", () => {
  const originalSecret = process.env.N8N_AUTOMATION_SECRET;

  afterEach(() => {
    process.env.N8N_AUTOMATION_SECRET = originalSecret;
  });

  it("claims one event with the exact RPC parameters and a no-store response", async () => {
    process.env.N8N_AUTOMATION_SECRET = automationSecret;
    const client = createClient([
      {
        id: eventId,
        idempotency_key: "quote_request.created:MBP-2026-000001",
        payload: { reference: "MBP-2026-000001", request: { email: "client@example.com" } },
        attempts: 1,
        lock_token: lockToken,
      },
    ]);

    const response = await handleInternalAutomationRequest(
      createRequest("/api/internal/automation/claim", { p_limit: 1 }),
      "claim",
      client,
    );

    expect(client.rpc).toHaveBeenCalledWith("claim_quote_request_automation_events", {
      p_limit: 1,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      events: [
        {
          id: eventId,
          idempotencyKey: "quote_request.created:MBP-2026-000001",
          payload: { reference: "MBP-2026-000001", request: { email: "client@example.com" } },
          attempts: 1,
          lockToken,
        },
      ],
    });
  });

  it("rejects requests without a valid bearer secret before invoking Supabase", async () => {
    process.env.N8N_AUTOMATION_SECRET = automationSecret;
    const client = createClient([]);

    const response = await handleInternalAutomationRequest(
      createRequest("/api/internal/automation/claim", { p_limit: 1 }, "wrong-secret"),
      "claim",
      client,
    );

    expect(response.status).toBe(401);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid and unexpected input without invoking Supabase", async () => {
    process.env.N8N_AUTOMATION_SECRET = automationSecret;
    const client = createClient([]);

    const response = await handleInternalAutomationRequest(
      createRequest("/api/internal/automation/claim", { p_limit: 2, extra: true }),
      "claim",
      client,
    );

    expect(response.status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("acknowledges an event using its exact locked RPC parameters", async () => {
    process.env.N8N_AUTOMATION_SECRET = automationSecret;
    const client = createClient(true);

    const response = await handleInternalAutomationRequest(
      createRequest("/api/internal/automation/succeeded", {
        event_id: eventId,
        lock_token: lockToken,
      }),
      "succeeded",
      client,
    );

    expect(client.rpc).toHaveBeenCalledWith("mark_quote_request_automation_event_succeeded", {
      p_event_id: eventId,
      p_lock_token: lockToken,
    });
    await expect(response.json()).resolves.toEqual({ succeeded: true });
  });

  it("reschedules an event using its exact RPC parameters", async () => {
    process.env.N8N_AUTOMATION_SECRET = automationSecret;
    const client = createClient(true);

    const response = await handleInternalAutomationRequest(
      createRequest("/api/internal/automation/reschedule", {
        event_id: eventId,
        lock_token: lockToken,
        error: "n8n temporary failure",
      }),
      "reschedule",
      client,
    );

    expect(client.rpc).toHaveBeenCalledWith("reschedule_quote_request_automation_event", {
      p_event_id: eventId,
      p_lock_token: lockToken,
      p_error: "n8n temporary failure",
    });
    await expect(response.json()).resolves.toEqual({ rescheduled: true });
  });

  it("returns 500 without leaking database details when Supabase fails", async () => {
    process.env.N8N_AUTOMATION_SECRET = automationSecret;
    const client = createClient(null, { message: "database connection failed" });

    const response = await handleInternalAutomationRequest(
      createRequest("/api/internal/automation/claim", { p_limit: 1 }),
      "claim",
      client,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Internal server error" });
  });

  it("returns 500 when the automation secret is not configured", async () => {
    delete process.env.N8N_AUTOMATION_SECRET;
    const client = createClient([]);

    const response = await handleInternalAutomationRequest(
      createRequest("/api/internal/automation/claim", { p_limit: 1 }),
      "claim",
      client,
    );

    expect(response.status).toBe(500);
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
