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

const succeededSchema = z
  .object({
    event_id: z.string().uuid(),
    lock_token: z.string().uuid(),
  })
  .strict();

const rescheduleSchema = succeededSchema
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

const claimedEventsSchema = z.array(claimedEventSchema);

type AutomationAction = "claim" | "succeeded" | "reschedule";

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

    if (action === "claim") {
      const parsed = claimSchema.safeParse(body);

      if (!parsed.success) {
        return json({ error: "Invalid request body" }, 400);
      }

      const supabase = client ?? createSupabaseServerClient();
      const result = await supabase.rpc("claim_quote_request_automation_events", {
        p_limit: parsed.data.p_limit,
      });

      if (result.error) {
        return json({ error: "Internal server error" }, 500);
      }

      const events = claimedEventsSchema.safeParse(result.data);

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
      const parsed = succeededSchema.safeParse(body);

      if (!parsed.success) {
        return json({ error: "Invalid request body" }, 400);
      }

      const supabase = client ?? createSupabaseServerClient();
      const result = await supabase.rpc("mark_quote_request_automation_event_succeeded", {
        p_event_id: parsed.data.event_id,
        p_lock_token: parsed.data.lock_token,
      });

      if (result.error || typeof result.data !== "boolean") {
        return json({ error: "Internal server error" }, 500);
      }

      return json({ succeeded: result.data });
    }

    const parsed = rescheduleSchema.safeParse(body);

    if (!parsed.success) {
      return json({ error: "Invalid request body" }, 400);
    }

    const supabase = client ?? createSupabaseServerClient();
    const result = await supabase.rpc("reschedule_quote_request_automation_event", {
      p_event_id: parsed.data.event_id,
      p_lock_token: parsed.data.lock_token,
      p_error: parsed.data.error,
    });

    if (result.error || typeof result.data !== "boolean") {
      return json({ error: "Internal server error" }, 500);
    }

    return json({ rescheduled: result.data });
  } catch {
    return json({ error: "Internal server error" }, 500);
  }
}
