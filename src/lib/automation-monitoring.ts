import "server-only";

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "./supabase-server";

const responseHeaders = {
  "Cache-Control": "no-store",
};

const heartbeatSchema = z
  .object({
    workflow: z.enum(["staging", "alerts"]),
  })
  .strict();

const monitoringSnapshotSchema = z
  .object({
    expected_active_workflows: z.number().int().nonnegative(),
    stale_heartbeats: z.number().int().nonnegative(),
    overdue_events: z.number().int().nonnegative(),
    overdue_alerts: z.number().int().nonnegative(),
    expired_event_locks: z.number().int().nonnegative(),
    expired_alert_locks: z.number().int().nonnegative(),
    delivery_unknown: z.number().int().nonnegative(),
    dead_letter: z.number().int().nonnegative(),
    high_attempts: z.number().int().nonnegative(),
  })
  .strict();

export const monitoringThresholds = {
  heartbeatMaxAgeSeconds: 15 * 60,
  overdueMaxAgeSeconds: 10 * 60,
  highAttempts: 6,
} as const;

type RpcResult = {
  data: unknown;
  error: unknown;
};

export type AutomationMonitoringRpcClient = {
  rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<RpcResult>;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: responseHeaders });
}

function hasValidBearerSecret(request: Request, environmentVariable: string) {
  const secret = process.env[environmentVariable];

  if (!secret) {
    throw new Error(`${environmentVariable} is not configured`);
  }

  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer (.+)$/);

  if (!match) {
    return false;
  }

  const expected = Buffer.from(secret);
  const received = Buffer.from(match[1]);

  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function parseBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function monitoringStatus(snapshot: z.infer<typeof monitoringSnapshotSchema>) {
  if (
    snapshot.stale_heartbeats > 0 ||
    snapshot.expired_event_locks > 0 ||
    snapshot.expired_alert_locks > 0 ||
    snapshot.delivery_unknown > 0 ||
    snapshot.dead_letter > 0
  ) {
    return "critical" as const;
  }

  if (
    snapshot.overdue_events > 0 ||
    snapshot.overdue_alerts > 0 ||
    snapshot.high_attempts > 0
  ) {
    return "warning" as const;
  }

  return "healthy" as const;
}

function toPublicSummary(snapshot: z.infer<typeof monitoringSnapshotSchema>) {
  return {
    expectedActiveWorkflows: snapshot.expected_active_workflows,
    staleHeartbeats: snapshot.stale_heartbeats,
    overdueEvents: snapshot.overdue_events,
    overdueAlerts: snapshot.overdue_alerts,
    expiredEventLocks: snapshot.expired_event_locks,
    expiredAlertLocks: snapshot.expired_alert_locks,
    deliveryUnknown: snapshot.delivery_unknown,
    deadLetter: snapshot.dead_letter,
    highAttempts: snapshot.high_attempts,
  };
}

function monitoringHttpStatus(status: "healthy" | "warning" | "critical") {
  return status === "critical" ? 503 : 200;
}

export async function handleMonitoringHeartbeat(
  request: Request,
  client?: AutomationMonitoringRpcClient,
) {
  try {
    if (!hasValidBearerSecret(request, "AUTOMATION_HEARTBEAT_SECRET")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await parseBody(request);
    const parsed = heartbeatSchema.safeParse(body);

    if (!parsed.success) {
      return json({ error: "Invalid request body" }, 400);
    }

    const supabase = client ?? createSupabaseServerClient();
    const result = await supabase.rpc("record_automation_heartbeat", {
      p_workflow_key: parsed.data.workflow,
    });

    if (result.error || result.data !== true) {
      return json({ error: "Internal server error" }, 500);
    }

    return json({ accepted: true });
  } catch {
    return json({ error: "Internal server error" }, 500);
  }
}

export async function handleMonitoringStatus(
  request: Request,
  client?: AutomationMonitoringRpcClient,
) {
  try {
    if (!hasValidBearerSecret(request, "MONITOR_SECRET")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = client ?? createSupabaseServerClient();
    const result = await supabase.rpc("get_automation_monitoring_snapshot", {
      p_heartbeat_max_age_seconds: monitoringThresholds.heartbeatMaxAgeSeconds,
      p_overdue_max_age_seconds: monitoringThresholds.overdueMaxAgeSeconds,
      p_high_attempts: monitoringThresholds.highAttempts,
    });
    const snapshot = monitoringSnapshotSchema.safeParse(result.data);

    if (result.error || !snapshot.success) {
      return json({ status: "unknown" }, 503);
    }

    const status = monitoringStatus(snapshot.data);

    return json({
      status,
      checkedAt: new Date().toISOString(),
      summary: toPublicSummary(snapshot.data),
    }, monitoringHttpStatus(status));
  } catch {
    return json({ status: "unknown" }, 503);
  }
}
