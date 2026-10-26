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

  it("marks delivery as started before SMTP using its exact locked RPC parameters", async () => {
    process.env.N8N_AUTOMATION_SECRET = automationSecret;
    const client = createClient(true);

    const response = await handleInternalAutomationRequest(
      createRequest("/api/internal/automation/delivery-started", {
        event_id: eventId,
        lock_token: lockToken,
      }),
      "delivery-started",
      client,
    );

    expect(client.rpc).toHaveBeenCalledWith("begin_quote_request_automation_delivery", {
      p_event_id: eventId,
      p_lock_token: lockToken,
    });
    await expect(response.json()).resolves.toEqual({ deliveryStarted: true });
  });

  it("exposes a stale delivery-started lock without treating it as an error", async () => {
    process.env.N8N_AUTOMATION_SECRET = automationSecret;
    const client = createClient(false);

    const response = await handleInternalAutomationRequest(
      createRequest("/api/internal/automation/delivery-started", {
        event_id: eventId,
        lock_token: lockToken,
      }),
      "delivery-started",
      client,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deliveryStarted: false, stale: true });
  });

  it("declares an uncertain delivery using its exact locked RPC parameters", async () => {
    process.env.N8N_AUTOMATION_SECRET = automationSecret;
    const client = createClient(true);

    const response = await handleInternalAutomationRequest(
      createRequest("/api/internal/automation/delivery-unknown", {
        event_id: eventId,
        lock_token: lockToken,
        error: "SMTP result was not confirmed",
      }),
      "delivery-unknown",
      client,
    );

    expect(client.rpc).toHaveBeenCalledWith(
      "mark_quote_request_automation_delivery_unknown",
      {
        p_event_id: eventId,
        p_lock_token: lockToken,
        p_error: "SMTP result was not confirmed",
      },
    );
    await expect(response.json()).resolves.toEqual({ deliveryUnknown: true });
  });

  it("returns the V2 retry disposition using its exact locked RPC parameters", async () => {
    process.env.N8N_AUTOMATION_SECRET = automationSecret;
    const client = createClient("retry_scheduled");

    const response = await handleInternalAutomationRequest(
      createRequest("/api/internal/automation/reschedule", {
        event_id: eventId,
        lock_token: lockToken,
        error: "n8n temporary failure",
      }),
      "reschedule",
      client,
    );

    expect(client.rpc).toHaveBeenCalledWith("reschedule_quote_request_automation_event_v2", {
      p_event_id: eventId,
      p_lock_token: lockToken,
      p_error: "n8n temporary failure",
    });
    await expect(response.json()).resolves.toEqual({
      disposition: "retry_scheduled",
      rescheduled: true,
    });
  });

  it("exposes dead_letter and stale retry dispositions without conflating them", async () => {
    process.env.N8N_AUTOMATION_SECRET = automationSecret;

    const deadLetter = await handleInternalAutomationRequest(
      createRequest("/api/internal/automation/reschedule", {
        event_id: eventId,
        lock_token: lockToken,
        error: "safe failure number eight",
      }),
      "reschedule",
      createClient("dead_letter"),
    );
    const stale = await handleInternalAutomationRequest(
      createRequest("/api/internal/automation/reschedule", {
        event_id: eventId,
        lock_token: lockToken,
        error: "stale worker",
      }),
      "reschedule",
      createClient("stale"),
    );

    await expect(deadLetter.json()).resolves.toEqual({
      disposition: "dead_letter",
      rescheduled: true,
    });
    await expect(stale.json()).resolves.toEqual({
      disposition: "stale",
      rescheduled: false,
    });
  });

  it("claims and confirms alert outbox events using their exact RPC parameters", async () => {
    process.env.N8N_AUTOMATION_SECRET = automationSecret;
    const alertId = "ca4cb092-406f-4edb-96c3-d2d7e271d4e8";
    const alertLockToken = "d153f26e-62ae-4f97-a1a3-c7b7745ffab9";
    const client = createClient([
      {
        id: alertId,
        automation_event_id: eventId,
        alert_type: "delivery_unknown",
        idempotency_key: `${eventId}:delivery_unknown`,
        payload: { automationEventId: eventId, alertType: "delivery_unknown", attempts: 1 },
        attempts: 1,
        lock_token: alertLockToken,
      },
    ]);

    const claimResponse = await handleInternalAutomationRequest(
      createRequest("/api/internal/automation/alerts/claim", { p_limit: 1 }),
      "alert-claim",
      client,
    );

    expect(client.rpc).toHaveBeenCalledWith("claim_quote_delivery_alerts", { p_limit: 1 });
    await expect(claimResponse.json()).resolves.toEqual({
      alerts: [
        {
          id: alertId,
          automationEventId: eventId,
          alertType: "delivery_unknown",
          idempotencyKey: `${eventId}:delivery_unknown`,
          payload: { automationEventId: eventId, alertType: "delivery_unknown", attempts: 1 },
          attempts: 1,
          lockToken: alertLockToken,
        },
      ],
    });

    const confirmationClient = createClient(true);
    const confirmationResponse = await handleInternalAutomationRequest(
      createRequest("/api/internal/automation/alerts/succeeded", {
        alert_id: alertId,
        lock_token: alertLockToken,
      }),
      "alert-succeeded",
      confirmationClient,
    );

    expect(confirmationClient.rpc).toHaveBeenCalledWith("mark_quote_delivery_alert_succeeded", {
      p_alert_id: alertId,
      p_lock_token: alertLockToken,
    });
    await expect(confirmationResponse.json()).resolves.toEqual({ succeeded: true });
  });

  it("reschedules alerts and exposes stale locks without invoking unrelated RPCs", async () => {
    process.env.N8N_AUTOMATION_SECRET = automationSecret;
    const alertId = "ca4cb092-406f-4edb-96c3-d2d7e271d4e8";
    const alertLockToken = "d153f26e-62ae-4f97-a1a3-c7b7745ffab9";
    const client = createClient(false);

    const response = await handleInternalAutomationRequest(
      createRequest("/api/internal/automation/alerts/reschedule", {
        alert_id: alertId,
        lock_token: alertLockToken,
        error: "notification webhook timeout",
      }),
      "alert-reschedule",
      client,
    );

    expect(client.rpc).toHaveBeenCalledWith("reschedule_quote_delivery_alert", {
      p_alert_id: alertId,
      p_lock_token: alertLockToken,
      p_error: "notification webhook timeout",
    });
    await expect(response.json()).resolves.toEqual({ rescheduled: false, stale: true });
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
