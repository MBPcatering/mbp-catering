import { afterEach, describe, expect, it, vi } from "vitest";

import {
  handleMonitoringHeartbeat,
  handleMonitoringStatus,
} from "./automation-monitoring";

const heartbeatSecret = "test-heartbeat-secret";
const monitorSecret = "test-monitor-secret";

function request(path: string, options: {
  body?: unknown;
  secret?: string;
  method?: "GET" | "POST";
} = {}) {
  return new Request(`http://localhost${path}`, {
    method: options.method ?? "POST",
    headers: {
      ...(options.secret ? { Authorization: `Bearer ${options.secret}` } : {}),
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

function client(data: unknown, error: unknown = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ data, error }),
  };
}

const healthySnapshot = {
  expected_active_workflows: 1,
  stale_heartbeats: 0,
  overdue_events: 0,
  overdue_alerts: 0,
  expired_event_locks: 0,
  expired_alert_locks: 0,
  delivery_unknown: 0,
  dead_letter: 0,
  high_attempts: 0,
};

describe("automation monitoring routes", () => {
  const originalHeartbeatSecret = process.env.AUTOMATION_HEARTBEAT_SECRET;
  const originalMonitorSecret = process.env.MONITOR_SECRET;

  afterEach(() => {
    process.env.AUTOMATION_HEARTBEAT_SECRET = originalHeartbeatSecret;
    process.env.MONITOR_SECRET = originalMonitorSecret;
  });

  it("rejects a heartbeat without the separate heartbeat secret", async () => {
    process.env.AUTOMATION_HEARTBEAT_SECRET = heartbeatSecret;
    const supabase = client(true);

    const response = await handleMonitoringHeartbeat(
      request("/api/internal/monitoring/heartbeat", { body: { workflow: "staging" } }),
      supabase,
    );

    expect(response.status).toBe(401);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("records a permitted heartbeat using only the approved workflow key", async () => {
    process.env.AUTOMATION_HEARTBEAT_SECRET = heartbeatSecret;
    const supabase = client(true);

    const response = await handleMonitoringHeartbeat(
      request("/api/internal/monitoring/heartbeat", {
        body: { workflow: "alerts" },
        secret: heartbeatSecret,
      }),
      supabase,
    );

    expect(supabase.rpc).toHaveBeenCalledWith("record_automation_heartbeat", {
      p_workflow_key: "alerts",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ accepted: true });
  });

  it("rejects an unapproved workflow without recording a heartbeat", async () => {
    process.env.AUTOMATION_HEARTBEAT_SECRET = heartbeatSecret;
    const supabase = client(true);

    const response = await handleMonitoringHeartbeat(
      request("/api/internal/monitoring/heartbeat", {
        body: { workflow: "anything-else" },
        secret: heartbeatSecret,
      }),
      supabase,
    );

    expect(response.status).toBe(400);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed and excessive heartbeat payloads without calling Supabase", async () => {
    process.env.AUTOMATION_HEARTBEAT_SECRET = heartbeatSecret;
    const malformedClient = client(true);
    const malformed = await handleMonitoringHeartbeat(
      new Request("http://localhost/api/internal/monitoring/heartbeat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${heartbeatSecret}`,
          "Content-Type": "application/json",
        },
        body: "{",
      }),
      malformedClient,
    );
    const excessiveClient = client(true);
    const excessive = await handleMonitoringHeartbeat(
      request("/api/internal/monitoring/heartbeat", {
        body: { workflow: "staging", unexpected: true },
        secret: heartbeatSecret,
      }),
      excessiveClient,
    );

    expect(malformed.status).toBe(400);
    expect(excessive.status).toBe(400);
    expect(malformedClient.rpc).not.toHaveBeenCalled();
    expect(excessiveClient.rpc).not.toHaveBeenCalled();
  });

  it("returns a technical healthy summary without business payloads", async () => {
    process.env.MONITOR_SECRET = monitorSecret;
    const supabase = client(healthySnapshot);

    const response = await handleMonitoringStatus(
      request("/api/internal/monitoring/status", {
        method: "GET",
        secret: monitorSecret,
      }),
      supabase,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      status: "healthy",
      summary: {
        expectedActiveWorkflows: 1,
        staleHeartbeats: 0,
        overdueEvents: 0,
        overdueAlerts: 0,
        expiredEventLocks: 0,
        expiredAlertLocks: 0,
        deliveryUnknown: 0,
        deadLetter: 0,
        highAttempts: 0,
      },
    });
  });

  it("returns warning for delayed work and critical for terminal delivery states", async () => {
    process.env.MONITOR_SECRET = monitorSecret;
    const warning = await handleMonitoringStatus(
      request("/api/internal/monitoring/status", { method: "GET", secret: monitorSecret }),
      client({ ...healthySnapshot, overdue_events: 1, high_attempts: 1 }),
    );
    const critical = await handleMonitoringStatus(
      request("/api/internal/monitoring/status", { method: "GET", secret: monitorSecret }),
      client({ ...healthySnapshot, delivery_unknown: 1 }),
    );

    await expect(warning.json()).resolves.toMatchObject({ status: "warning" });
    await expect(critical.json()).resolves.toMatchObject({ status: "critical" });
    expect(warning.status).toBe(200);
    expect(critical.status).toBe(503);
  });

  it.each([
    ["a missing heartbeat", { ...healthySnapshot, expected_active_workflows: 1, stale_heartbeats: 1 }, "critical"],
    ["an expired event lock", { ...healthySnapshot, expired_event_locks: 1 }, "critical"],
    ["an expired alert lock", { ...healthySnapshot, expired_alert_locks: 1 }, "critical"],
    ["a dead letter", { ...healthySnapshot, dead_letter: 1 }, "critical"],
    ["high attempts", { ...healthySnapshot, high_attempts: 1 }, "warning"],
    ["only inactive expected workflows", { ...healthySnapshot, expected_active_workflows: 0 }, "healthy"],
  ])("classifies %s without exposing a business payload", async (_label, snapshot, status) => {
    process.env.MONITOR_SECRET = monitorSecret;

    const response = await handleMonitoringStatus(
      request("/api/internal/monitoring/status", { method: "GET", secret: monitorSecret }),
      client(snapshot),
    );
    const body = await response.json();

    expect(body.status).toBe(status);
    expect(JSON.stringify(body)).not.toMatch(/payload|locktoken|email|phone|error/i);
  });

  it("treats a rejected heartbeat write as a server failure without reporting details", async () => {
    process.env.AUTOMATION_HEARTBEAT_SECRET = heartbeatSecret;

    const response = await handleMonitoringHeartbeat(
      request("/api/internal/monitoring/heartbeat", {
        body: { workflow: "staging" },
        secret: heartbeatSecret,
      }),
      client(false),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Internal server error" });
  });

  it("returns unknown with a server error when Supabase is unavailable", async () => {
    process.env.MONITOR_SECRET = monitorSecret;

    const response = await handleMonitoringStatus(
      request("/api/internal/monitoring/status", { method: "GET", secret: monitorSecret }),
      client(null, { message: "offline" }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unknown" });
  });

  it("does not report healthy when the monitoring secret or RPC transport is unavailable", async () => {
    delete process.env.MONITOR_SECRET;
    const missingSecretClient = client(healthySnapshot);
    const missingSecret = await handleMonitoringStatus(
      request("/api/internal/monitoring/status", { method: "GET", secret: monitorSecret }),
      missingSecretClient,
    );

    process.env.MONITOR_SECRET = monitorSecret;
    const unavailableClient = {
      rpc: vi.fn().mockRejectedValue(new Error("network unavailable")),
    };
    const unavailable = await handleMonitoringStatus(
      request("/api/internal/monitoring/status", { method: "GET", secret: monitorSecret }),
      unavailableClient,
    );

    expect(missingSecret.status).toBe(503);
    expect(unavailable.status).toBe(503);
    expect(missingSecretClient.rpc).not.toHaveBeenCalled();
    await expect(missingSecret.json()).resolves.toEqual({ status: "unknown" });
    await expect(unavailable.json()).resolves.toEqual({ status: "unknown" });
  });

  it("never returns a monitoring snapshot to an invalid monitor credential", async () => {
    process.env.MONITOR_SECRET = monitorSecret;
    const supabase = client(healthySnapshot);

    const response = await handleMonitoringStatus(
      request("/api/internal/monitoring/status", { method: "GET", secret: "wrong" }),
      supabase,
    );

    expect(response.status).toBe(401);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
