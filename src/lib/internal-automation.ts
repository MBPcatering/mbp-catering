import "server-only";

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "./supabase-server";

const responseHeaders = {
  "Cache-Control": "no-store",
};

const claimSchema = z
  .object({
    p_limit: z.number().int().min(1).max(1),
  })
  .strict();

const eventLockSchema = z
  .object({
    event_id: z.string().uuid(),
    lock_token: z.string().uuid(),
  })
  .strict();

const deliveryUnknownSchema = eventLockSchema
  .extend({
    error: z.string().trim().min(1).max(1000),
  })
  .strict();

const alertLockSchema = z
  .object({
    alert_id: z.string().uuid(),
    lock_token: z.string().uuid(),
  })
  .strict();

const alertRescheduleSchema = alertLockSchema
  .extend({
    error: z.string().trim().min(1).max(1000),
  })
  .strict();

const claimedEventSchema = z.object({
  id: z.string().uuid(),
  idempotency_key: z.string().min(1),
  payload: z.unknown(),
  attempts: z.number().int().positive(),
  lock_token: z.string().uuid(),
});

const claimedAlertSchema = z.object({
  id: z.string().uuid(),
  automation_event_id: z.string().uuid(),
  alert_type: z.enum(["delivery_unknown", "dead_letter"]),
  idempotency_key: z.string().min(1),
  payload: z.unknown(),
  attempts: z.number().int().positive(),
  lock_token: z.string().uuid(),
});

const retryDispositionSchema = z.enum([
  "retry_scheduled",
  "dead_letter",
  "delivery_unknown",
  "stale",
]);

const alertRetryDispositionSchema = z.enum([
  "retry_scheduled",
  "dead_letter",
  "delivery_unknown",
  "stale",
]);

type AutomationAction =
  | "alert-claim"
  | "alert-delivery-started"
  | "alert-delivery-unknown"
  | "alert-reschedule"
  | "alert-succeeded"
  | "claim"
  | "delivery-started"
  | "delivery-unknown"
  | "reschedule"
  | "succeeded";

type RpcResult = {
  data: unknown;
  error: unknown;
};

export type AutomationRpcClient = {
  rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<RpcResult>;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: responseHeaders });
}

function isAuthorized(request: Request) {
  const secret = process.env.N8N_AUTOMATION_SECRET;

  if (!secret) {
    throw new Error("N8N_AUTOMATION_SECRET is not configured");
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

function staleResult(key: "deliveryStarted" | "deliveryUnknown" | "rescheduled" | "succeeded") {
  return { [key]: false, stale: true };
}

export async function handleInternalAutomationRequest(
  request: Request,
  action: AutomationAction,
  client?: AutomationRpcClient,
) {
  try {
    if (!isAuthorized(request)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await parseBody(request);
    const supabase = client ?? createSupabaseServerClient();

    if (action === "claim") {
      const parsed = claimSchema.safeParse(body);

      if (!parsed.success) {
        return json({ error: "Invalid request body" }, 400);
      }

      const result = await supabase.rpc("claim_quote_request_automation_events", {
        p_limit: parsed.data.p_limit,
      });

      if (result.error) {
        return json({ error: "Internal server error" }, 500);
      }

      const events = z.array(claimedEventSchema).safeParse(result.data);

      if (!events.success) {
        return json({ error: "Internal server error" }, 500);
      }

      return json({
        events: events.data.map((event) => ({
          id: event.id,
          idempotencyKey: event.idempotency_key,
          payload: event.payload,
          attempts: event.attempts,
          lockToken: event.lock_token,
        })),
      });
    }

    if (action === "succeeded") {
      const parsed = eventLockSchema.safeParse(body);

      if (!parsed.success) {
        return json({ error: "Invalid request body" }, 400);
      }

      const result = await supabase.rpc("mark_quote_request_automation_event_succeeded", {
        p_event_id: parsed.data.event_id,
        p_lock_token: parsed.data.lock_token,
      });

      if (result.error || typeof result.data !== "boolean") {
        return json({ error: "Internal server error" }, 500);
      }

      return json({ succeeded: result.data });
    }

    if (action === "delivery-started") {
      const parsed = eventLockSchema.safeParse(body);

      if (!parsed.success) {
        return json({ error: "Invalid request body" }, 400);
      }

      const result = await supabase.rpc("begin_quote_request_automation_delivery", {
        p_event_id: parsed.data.event_id,
        p_lock_token: parsed.data.lock_token,
      });

      if (result.error || typeof result.data !== "boolean") {
        return json({ error: "Internal server error" }, 500);
      }

      return json(result.data ? { deliveryStarted: true } : staleResult("deliveryStarted"));
    }

    if (action === "delivery-unknown") {
      const parsed = deliveryUnknownSchema.safeParse(body);

      if (!parsed.success) {
        return json({ error: "Invalid request body" }, 400);
      }

      const result = await supabase.rpc("mark_quote_request_automation_delivery_unknown", {
        p_event_id: parsed.data.event_id,
        p_lock_token: parsed.data.lock_token,
        p_error: parsed.data.error,
      });

      if (result.error || typeof result.data !== "boolean") {
        return json({ error: "Internal server error" }, 500);
      }

      return json(result.data ? { deliveryUnknown: true } : staleResult("deliveryUnknown"));
    }

    if (action === "reschedule") {
      const parsed = deliveryUnknownSchema.safeParse(body);

      if (!parsed.success) {
        return json({ error: "Invalid request body" }, 400);
      }

      const result = await supabase.rpc("reschedule_quote_request_automation_event_v2", {
        p_event_id: parsed.data.event_id,
        p_lock_token: parsed.data.lock_token,
        p_error: parsed.data.error,
      });
      const disposition = retryDispositionSchema.safeParse(result.data);

      if (result.error || !disposition.success) {
        return json({ error: "Internal server error" }, 500);
      }

      return json({
        disposition: disposition.data,
        rescheduled: disposition.data !== "stale",
      });
    }

    if (action === "alert-claim") {
      const parsed = claimSchema.safeParse(body);

      if (!parsed.success) {
        return json({ error: "Invalid request body" }, 400);
      }

      const result = await supabase.rpc("claim_quote_delivery_alerts", {
        p_limit: parsed.data.p_limit,
      });
      const alerts = z.array(claimedAlertSchema).safeParse(result.data);

      if (result.error || !alerts.success) {
        return json({ error: "Internal server error" }, 500);
      }

      return json({
        alerts: alerts.data.map((alert) => ({
          id: alert.id,
          automationEventId: alert.automation_event_id,
          alertType: alert.alert_type,
          idempotencyKey: alert.idempotency_key,
          payload: alert.payload,
          attempts: alert.attempts,
          lockToken: alert.lock_token,
        })),
      });
    }

    if (action === "alert-succeeded") {
      const parsed = alertLockSchema.safeParse(body);

      if (!parsed.success) {
        return json({ error: "Invalid request body" }, 400);
      }

      const result = await supabase.rpc("mark_quote_delivery_alert_succeeded", {
        p_alert_id: parsed.data.alert_id,
        p_lock_token: parsed.data.lock_token,
      });

      if (result.error || typeof result.data !== "boolean") {
        return json({ error: "Internal server error" }, 500);
      }

      return json(result.data ? { succeeded: true } : staleResult("succeeded"));
    }

    if (action === "alert-delivery-started") {
      const parsed = alertLockSchema.safeParse(body);

      if (!parsed.success) {
        return json({ error: "Invalid request body" }, 400);
      }

      const result = await supabase.rpc("begin_quote_delivery_alert_delivery", {
        p_alert_id: parsed.data.alert_id,
        p_lock_token: parsed.data.lock_token,
      });

      if (result.error || typeof result.data !== "boolean") {
        return json({ error: "Internal server error" }, 500);
      }

      return json(result.data ? { deliveryStarted: true } : staleResult("deliveryStarted"));
    }

    if (action === "alert-delivery-unknown") {
      const parsed = alertRescheduleSchema.safeParse(body);

      if (!parsed.success) {
        return json({ error: "Invalid request body" }, 400);
      }

      const result = await supabase.rpc("mark_quote_delivery_alert_delivery_unknown", {
        p_alert_id: parsed.data.alert_id,
        p_lock_token: parsed.data.lock_token,
        p_error: parsed.data.error,
      });

      if (result.error || typeof result.data !== "boolean") {
        return json({ error: "Internal server error" }, 500);
      }

      return json(result.data ? { deliveryUnknown: true } : staleResult("deliveryUnknown"));
    }

    const parsed = alertRescheduleSchema.safeParse(body);

    if (!parsed.success) {
      return json({ error: "Invalid request body" }, 400);
    }

    const result = await supabase.rpc("reschedule_quote_delivery_alert_v3", {
      p_alert_id: parsed.data.alert_id,
      p_lock_token: parsed.data.lock_token,
      p_error: parsed.data.error,
    });

    const disposition = alertRetryDispositionSchema.safeParse(result.data);

    if (result.error || !disposition.success) {
      return json({ error: "Internal server error" }, 500);
    }

    return json({
      disposition: disposition.data,
      rescheduled: disposition.data !== "stale",
    });
  } catch {
    return json({ error: "Internal server error" }, 500);
  }
}
