import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.SUPABASE_TEST_DB_URL;
const describeLocal = databaseUrl ? describe : describe.skip;

type ClaimedEvent = {
  attempts: number;
  id: string;
  lock_token: string;
};

type ClaimedAlert = {
  alert_type: "dead_letter" | "delivery_unknown";
  attempts: number;
  automation_event_id: string;
  id: string;
  lock_token: string;
};

describeLocal("quote request automation outbox", () => {
  const database = new Client({ connectionString: databaseUrl });
  const testFingerprint = `integration-${randomUUID()}`;

  beforeAll(async () => {
    await database.connect();
  });

  afterEach(async () => {
    await database.query(
      "delete from public.automation_events where source_fingerprint = $1",
      [testFingerprint],
    );
    await database.query(
      "delete from public.quote_requests where source_fingerprint = $1",
      [testFingerprint],
    );
    await database.query(
      "delete from public.catalogue_downloads where source_fingerprint = $1",
      [testFingerprint],
    );
  });

  afterAll(async () => {
    await database.end();
  });

  async function seedQuoteEvent(options?: {
    deliveryStartedAt?: string;
    lockedAt?: string;
    nextAttemptAt?: string;
    status?: "failed" | "pending" | "processing";
  }) {
    const quote = await database.query<{ id: string }>(
      `insert into public.quote_requests (
        request_type, event_date, guest_count, address, services, delivery,
        first_name, last_name, phone, email, source_fingerprint
      ) values (
        'b2b', current_date + 30, 10, 'Rue de Test 1, 1000 Bruxelles',
        array['lunch'], 'delivery', 'Test', 'Worker', '+3225550000',
        $2, $1
      ) returning id`,
      [testFingerprint, `quote-${randomUUID()}@example.test`],
    );

    const event = await database.query<{ id: string }>(
      `insert into public.automation_events (
        quote_request_id, event_type, idempotency_key, source_fingerprint,
        payload, status, next_attempt_at, locked_at, lock_token, delivery_started_at
      ) values (
        $1, 'quote_request.created', $2, $3, '{"request":"test"}'::jsonb,
        $4, coalesce($5::timestamptz, timezone('utc', now())), $6::timestamptz, gen_random_uuid(), $7::timestamptz
      ) returning id`,
      [
        quote.rows[0].id,
        `quote-${randomUUID()}`,
        testFingerprint,
        options?.status ?? "pending",
        options?.nextAttemptAt ?? null,
        options?.lockedAt ?? null,
        options?.deliveryStartedAt ?? null,
      ],
    );

    return event.rows[0].id;
  }

  async function seedCatalogueEvent() {
    const download = await database.query<{ id: string }>(
      `insert into public.catalogue_downloads (
        first_name, last_name, phone, email, source_fingerprint
      ) values ('Test', 'Catalogue', '+3225550000', $1, $2) returning id`,
      [`catalogue-${randomUUID()}@example.test`, testFingerprint],
    );

    await database.query(
      `insert into public.automation_events (
        catalogue_download_id, event_type, idempotency_key, source_fingerprint, payload
      ) values ($1, 'catalogue_download.created', $2, $3, '{"request":"test"}'::jsonb)`,
      [download.rows[0].id, `catalogue-${randomUUID()}`, testFingerprint],
    );
  }

  async function claim(limit = 25) {
    const result = await database.query<ClaimedEvent>(
      "select * from public.claim_quote_request_automation_events($1)",
      [limit],
    );

    return result.rows;
  }

  async function beginDelivery(eventId: string, lockToken: string) {
    const result = await database.query<{ started: boolean }>(
      "select public.begin_quote_request_automation_delivery($1, $2) as started",
      [eventId, lockToken],
    );

    return result.rows[0].started;
  }

  async function markDeliveryUnknown(
    eventId: string,
    lockToken: string,
    error = "SMTP outcome could not be confirmed",
  ) {
    const result = await database.query<{ marked_unknown: boolean }>(
      "select public.mark_quote_request_automation_delivery_unknown($1, $2, $3) as marked_unknown",
      [eventId, lockToken, error],
    );

    return result.rows[0].marked_unknown;
  }

  async function alertCount(eventId: string, alertType: string) {
    const result = await database.query<{ count: string }>(
      "select count(*)::text as count from public.automation_alerts where automation_event_id = $1 and alert_type = $2",
      [eventId, alertType],
    );

    return Number(result.rows[0].count);
  }

  async function claimAlerts(limit = 25) {
    const result = await database.query<ClaimedAlert>(
      "select * from public.claim_quote_delivery_alerts($1)",
      [limit],
    );

    return result.rows;
  }

  async function beginAlertDelivery(alertId: string, lockToken: string) {
    const result = await database.query<{ started: boolean }>(
      "select public.begin_quote_delivery_alert_delivery($1, $2) as started",
      [alertId, lockToken],
    );

    return result.rows[0].started;
  }

  async function markAlertDeliveryUnknown(
    alertId: string,
    lockToken: string,
    error = "SMTP result could not be confirmed after alert delivery started",
  ) {
    const result = await database.query<{ marked_unknown: boolean }>(
      "select public.mark_quote_delivery_alert_delivery_unknown($1, $2, $3) as marked_unknown",
      [alertId, lockToken, error],
    );

    return result.rows[0].marked_unknown;
  }

  async function seedClaimedAlert() {
    const eventId = await seedQuoteEvent();
    const [claimedEvent] = await claim(1);
    expect(await beginDelivery(eventId, claimedEvent.lock_token)).toBe(true);
    expect(await markDeliveryUnknown(eventId, claimedEvent.lock_token)).toBe(true);

    const [alert] = await claimAlerts(1);
    expect(alert).toBeDefined();
    return alert;
  }

  async function expireAlertLock(alertId: string) {
    await database.query(
      `update public.automation_alerts
       set locked_at = timezone('utc', now()) - interval '11 minutes'
       where id = $1`,
      [alertId],
    );
  }

  it("gives concurrent workers distinct quote events", async () => {
    await seedQuoteEvent();
    await seedQuoteEvent();

    const [first, second] = await Promise.all([claim(1), claim(1)]);
    const claimedIds = [...first, ...second].map((event) => event.id);

    expect(claimedIds).toHaveLength(2);
    expect(new Set(claimedIds).size).toBe(2);
    expect([...first, ...second].every((event) => event.attempts === 1)).toBe(
      true,
    );
  });

  it("releases an expired pre-delivery lock with a new token and rejects stale completion", async () => {
    const eventId = await seedQuoteEvent({
      lockedAt: "2000-01-01T00:00:00Z",
      status: "processing",
    });
    const previousLock = await database.query<{ lock_token: string }>(
      "select lock_token from public.automation_events where id = $1",
      [eventId],
    );

    const [claimed] = await claim(1);
    expect(claimed.id).toBe(eventId);
    expect(claimed.attempts).toBe(1);
    expect(claimed.lock_token).not.toBe(previousLock.rows[0].lock_token);

    const staleCompletion = await database.query<{ succeeded: boolean }>(
      "select public.mark_quote_request_automation_event_succeeded($1, $2) as succeeded",
      [eventId, previousLock.rows[0].lock_token],
    );
    expect(staleCompletion.rows[0].succeeded).toBe(false);

    expect(await beginDelivery(eventId, claimed.lock_token)).toBe(true);

    const completion = await database.query<{ succeeded: boolean }>(
      "select public.mark_quote_request_automation_event_succeeded($1, $2) as succeeded",
      [eventId, claimed.lock_token],
    );
    expect(completion.rows[0].succeeded).toBe(true);

    const status = await database.query<{ delivered_at: string; status: string }>(
      "select status, delivered_at from public.automation_events where id = $1",
      [eventId],
    );
    expect(status.rows[0].status).toBe("succeeded");
    expect(status.rows[0].delivered_at).toBeTruthy();
  });

  it("reschedules a failed delivery and increments its attempt on retry", async () => {
    const eventId = await seedQuoteEvent();
    const [firstClaim] = await claim(1);

    const rescheduled = await database.query<{ rescheduled: boolean }>(
      "select public.reschedule_quote_request_automation_event($1, $2, $3) as rescheduled",
      [eventId, firstClaim.lock_token, "n8n timeout"],
    );
    expect(rescheduled.rows[0].rescheduled).toBe(true);

    const afterFailure = await database.query<{
      attempts: number;
      locked_at: string | null;
      status: string;
    }>(
      "select status, attempts, locked_at from public.automation_events where id = $1",
      [eventId],
    );
    expect(afterFailure.rows[0]).toMatchObject({
      attempts: 1,
      locked_at: null,
      status: "failed",
    });

    await database.query(
      "update public.automation_events set next_attempt_at = timezone('utc', now()) - interval '1 second' where id = $1",
      [eventId],
    );
    const [retry] = await claim(1);

    expect(retry).toMatchObject({ attempts: 2, id: eventId });
    expect(retry.lock_token).not.toBe(firstClaim.lock_token);
  });

  it("quarantines an expired lock after delivery started instead of reclaiming it", async () => {
    const eventId = await seedQuoteEvent({
      deliveryStartedAt: "2000-01-01T00:00:00Z",
      lockedAt: "2000-01-01T00:00:00Z",
      status: "processing",
    });

    await expect(claim(1)).resolves.toEqual([]);

    const event = await database.query<{
      delivery_unknown_at: string | null;
      lock_token: string | null;
      locked_at: string | null;
      status: string;
    }>(
      "select status, locked_at, lock_token, delivery_unknown_at from public.automation_events where id = $1",
      [eventId],
    );

    expect(event.rows[0]).toMatchObject({
      lock_token: null,
      locked_at: null,
      status: "delivery_unknown",
    });
    expect(event.rows[0].delivery_unknown_at).toBeTruthy();
    expect(await alertCount(eventId, "delivery_unknown")).toBe(1);
  });

  it("treats every error after delivery started as unknown and creates one alert", async () => {
    const eventId = await seedQuoteEvent();
    const [claimed] = await claim(1);

    expect(await beginDelivery(eventId, claimed.lock_token)).toBe(true);
    expect(await markDeliveryUnknown(eventId, claimed.lock_token)).toBe(true);
    expect(await markDeliveryUnknown(eventId, claimed.lock_token)).toBe(false);

    const event = await database.query<{
      next_attempt_at: string | null;
      status: string;
    }>(
      "select status, next_attempt_at from public.automation_events where id = $1",
      [eventId],
    );

    expect(event.rows[0]).toEqual({
      next_attempt_at: null,
      status: "delivery_unknown",
    });
    expect(await alertCount(eventId, "delivery_unknown")).toBe(1);
  });

  it("moves an event to dead_letter after its eighth safely retryable failure", async () => {
    const eventId = await seedQuoteEvent();

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const [claimed] = await claim(1);
      expect(claimed).toMatchObject({ attempts: attempt, id: eventId });

      const rescheduled = await database.query<{ rescheduled: boolean }>(
        "select public.reschedule_quote_request_automation_event($1, $2, $3) as rescheduled",
        [eventId, claimed.lock_token, `safe failure ${attempt}`],
      );
      expect(rescheduled.rows[0].rescheduled).toBe(true);

      if (attempt < 8) {
        await database.query(
          "update public.automation_events set next_attempt_at = timezone('utc', now()) - interval '1 second' where id = $1",
          [eventId],
        );
      }
    }

    const event = await database.query<{
      dead_lettered_at: string | null;
      next_attempt_at: string | null;
      status: string;
    }>(
      "select status, next_attempt_at, dead_lettered_at from public.automation_events where id = $1",
      [eventId],
    );

    expect(event.rows[0]).toMatchObject({
      next_attempt_at: null,
      status: "dead_letter",
    });
    expect(event.rows[0].dead_lettered_at).toBeTruthy();
    await expect(claim(1)).resolves.toEqual([]);
    expect(await alertCount(eventId, "dead_letter")).toBe(1);
  });

  it("returns retry_scheduled and stale dispositions from the V2 retry RPC", async () => {
    const eventId = await seedQuoteEvent();
    const [claimed] = await claim(1);

    const retry = await database.query<{ disposition: string }>(
      "select public.reschedule_quote_request_automation_event_v2($1, $2, $3) as disposition",
      [eventId, claimed.lock_token, "safe retryable failure"],
    );
    const stale = await database.query<{ disposition: string }>(
      "select public.reschedule_quote_request_automation_event_v2($1, $2, $3) as disposition",
      [eventId, claimed.lock_token, "stale worker"],
    );

    expect(retry.rows[0].disposition).toBe("retry_scheduled");
    expect(stale.rows[0].disposition).toBe("stale");
  });

  it("keeps the legacy retry RPC behind the V2 delivery-unknown safeguard", async () => {
    const eventId = await seedQuoteEvent();
    const [claimed] = await claim(1);
    expect(await beginDelivery(eventId, claimed.lock_token)).toBe(true);

    const result = await database.query<{ rescheduled: boolean }>(
      "select public.reschedule_quote_request_automation_event($1, $2, $3) as rescheduled",
      [eventId, claimed.lock_token, "legacy worker failure after SMTP started"],
    );
    const event = await database.query<{ status: string }>(
      "select status from public.automation_events where id = $1",
      [eventId],
    );

    expect(result.rows[0].rescheduled).toBe(true);
    expect(event.rows[0].status).toBe("delivery_unknown");
  });

  it("reserves alert events concurrently and rejects stale confirmations", async () => {
    const eventId = await seedQuoteEvent();
    const [claimed] = await claim(1);
    expect(await beginDelivery(eventId, claimed.lock_token)).toBe(true);
    expect(await markDeliveryUnknown(eventId, claimed.lock_token)).toBe(true);

    const [first, second] = await Promise.all([claimAlerts(1), claimAlerts(1)]);
    const alerts = [...first, ...second];

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      alert_type: "delivery_unknown",
      automation_event_id: eventId,
      attempts: 1,
    });

    const stale = await database.query<{ succeeded: boolean }>(
      "select public.mark_quote_delivery_alert_succeeded($1, $2) as succeeded",
      [alerts[0].id, randomUUID()],
    );
    expect(await beginAlertDelivery(alerts[0].id, alerts[0].lock_token)).toBe(true);
    const completed = await database.query<{ succeeded: boolean }>(
      "select public.mark_quote_delivery_alert_succeeded($1, $2) as succeeded",
      [alerts[0].id, alerts[0].lock_token],
    );

    expect(stale.rows[0].succeeded).toBe(false);
    expect(completed.rows[0].succeeded).toBe(true);
  });

  it("reschedules alert delivery failures and rejects stale alert locks", async () => {
    const eventId = await seedQuoteEvent();
    const [claimed] = await claim(1);
    expect(await beginDelivery(eventId, claimed.lock_token)).toBe(true);
    expect(await markDeliveryUnknown(eventId, claimed.lock_token)).toBe(true);
    const [alert] = await claimAlerts(1);

    const rescheduled = await database.query<{ rescheduled: boolean }>(
      "select public.reschedule_quote_delivery_alert($1, $2, $3) as rescheduled",
      [alert.id, alert.lock_token, "notification destination unavailable"],
    );
    const stale = await database.query<{ rescheduled: boolean }>(
      "select public.reschedule_quote_delivery_alert($1, $2, $3) as rescheduled",
      [alert.id, alert.lock_token, "stale worker"],
    );

    expect(rescheduled.rows[0].rescheduled).toBe(true);
    expect(stale.rows[0].rescheduled).toBe(false);
  });

  it("retries a certain pre-SMTP alert failure with the initial sixty-second backoff", async () => {
    const eventId = await seedQuoteEvent();
    const [claimedEvent] = await claim(1);
    expect(await beginDelivery(eventId, claimedEvent.lock_token)).toBe(true);
    expect(await markDeliveryUnknown(eventId, claimedEvent.lock_token)).toBe(true);
    const [alert] = await claimAlerts(1);

    const result = await database.query<{ disposition: string }>(
      "select public.reschedule_quote_delivery_alert_v3($1, $2, $3) as disposition",
      [alert.id, alert.lock_token, "certain failure before SMTP started"],
    );
    expect(result.rows[0].disposition).toBe("retry_scheduled");

    const state = await database.query<{
      delivery_started_at: string | null;
      locked_at: string | null;
      next_attempt_at: string;
      status: string;
    }>(
      "select status, locked_at, next_attempt_at, delivery_started_at from public.automation_alerts where id = $1",
      [alert.id],
    );
    expect(state.rows[0]).toMatchObject({
      delivery_started_at: null,
      locked_at: null,
      status: "failed",
    });
    expect(new Date(state.rows[0].next_attempt_at).getTime() - Date.now()).toBeGreaterThan(45_000);
  });

  it("recovers an expired pre-SMTP alert lock with a new token and rejects the stale token", async () => {
    const eventId = await seedQuoteEvent();
    const [claimedEvent] = await claim(1);
    expect(await beginDelivery(eventId, claimedEvent.lock_token)).toBe(true);
    expect(await markDeliveryUnknown(eventId, claimedEvent.lock_token)).toBe(true);
    const [firstAlert] = await claimAlerts(1);

    await database.query(
      "update public.automation_alerts set locked_at = timezone('utc', now()) - interval '11 minutes' where id = $1",
      [firstAlert.id],
    );
    const [reclaimed] = await claimAlerts(1);
    expect(reclaimed.id).toBe(firstAlert.id);
    expect(reclaimed.attempts).toBe(2);
    expect(reclaimed.lock_token).not.toBe(firstAlert.lock_token);

    const stale = await database.query<{ disposition: string }>(
      "select public.reschedule_quote_delivery_alert_v3($1, $2, $3) as disposition",
      [firstAlert.id, firstAlert.lock_token, "stale worker"],
    );
    expect(stale.rows[0].disposition).toBe("stale");
  });

  it("rejects alert success before delivery is explicitly started", async () => {
    const eventId = await seedQuoteEvent();
    const [claimedEvent] = await claim(1);
    expect(await beginDelivery(eventId, claimedEvent.lock_token)).toBe(true);
    expect(await markDeliveryUnknown(eventId, claimedEvent.lock_token)).toBe(true);
    const [alert] = await claimAlerts(1);

    const succeeded = await database.query<{ succeeded: boolean }>(
      "select public.mark_quote_delivery_alert_succeeded($1, $2) as succeeded",
      [alert.id, alert.lock_token],
    );
    expect(succeeded.rows[0].succeeded).toBe(false);
  });

  it("refuses delivery-started for an expired alert lock without changing the alert", async () => {
    const alert = await seedClaimedAlert();
    await expireAlertLock(alert.id);

    expect(await beginAlertDelivery(alert.id, alert.lock_token)).toBe(false);

    const state = await database.query<{
      delivery_started_at: string | null;
      lock_token: string | null;
      status: string;
    }>(
      "select status, lock_token, delivery_started_at from public.automation_alerts where id = $1",
      [alert.id],
    );
    expect(state.rows[0]).toMatchObject({
      delivery_started_at: null,
      lock_token: alert.lock_token,
      status: "processing",
    });
  });

  it("refuses alert success for an expired alert lock without changing the alert", async () => {
    const alert = await seedClaimedAlert();
    expect(await beginAlertDelivery(alert.id, alert.lock_token)).toBe(true);
    await expireAlertLock(alert.id);

    const result = await database.query<{ succeeded: boolean }>(
      "select public.mark_quote_delivery_alert_succeeded($1, $2) as succeeded",
      [alert.id, alert.lock_token],
    );
    expect(result.rows[0].succeeded).toBe(false);

    const state = await database.query<{
      delivered_at: string | null;
      lock_token: string | null;
      status: string;
    }>(
      "select status, lock_token, delivered_at from public.automation_alerts where id = $1",
      [alert.id],
    );
    expect(state.rows[0]).toMatchObject({
      delivered_at: null,
      lock_token: alert.lock_token,
      status: "processing",
    });
  });

  it("refuses delivery-unknown for an expired alert lock without changing the alert", async () => {
    const alert = await seedClaimedAlert();
    expect(await beginAlertDelivery(alert.id, alert.lock_token)).toBe(true);
    await expireAlertLock(alert.id);

    expect(await markAlertDeliveryUnknown(alert.id, alert.lock_token)).toBe(false);

    const state = await database.query<{
      delivery_unknown_at: string | null;
      lock_token: string | null;
      status: string;
    }>(
      "select status, lock_token, delivery_unknown_at from public.automation_alerts where id = $1",
      [alert.id],
    );
    expect(state.rows[0]).toMatchObject({
      delivery_unknown_at: null,
      lock_token: alert.lock_token,
      status: "processing",
    });
  });

  it("refuses reschedule for an expired alert lock without changing the alert", async () => {
    const alert = await seedClaimedAlert();
    await expireAlertLock(alert.id);

    const result = await database.query<{ disposition: string }>(
      "select public.reschedule_quote_delivery_alert_v3($1, $2, $3) as disposition",
      [alert.id, alert.lock_token, "expired worker must not reschedule"],
    );
    expect(result.rows[0].disposition).toBe("stale");

    const state = await database.query<{
      last_error: string | null;
      lock_token: string | null;
      status: string;
    }>(
      "select status, lock_token, last_error from public.automation_alerts where id = $1",
      [alert.id],
    );
    expect(state.rows[0]).toMatchObject({
      lock_token: alert.lock_token,
      status: "processing",
    });
    expect(state.rows[0].last_error).not.toBe("expired worker must not reschedule");
  });

  it("accepts a current alert lock and rejects the exact ten-minute expiry boundary", async () => {
    const alert = await seedClaimedAlert();
    expect(await beginAlertDelivery(alert.id, alert.lock_token)).toBe(true);

    const secondAlert = await seedClaimedAlert();
    await database.query("begin");
    try {
      await database.query(
        `update public.automation_alerts
         set locked_at = timezone('utc', now()) - interval '10 minutes'
         where id = $1`,
        [secondAlert.id],
      );
      const boundary = await database.query<{ started: boolean }>(
        "select public.begin_quote_delivery_alert_delivery($1, $2) as started",
        [secondAlert.id, secondAlert.lock_token],
      );
      expect(boundary.rows[0].started).toBe(false);
    } finally {
      await database.query("rollback");
    }
  });

  it("deduplicates alerts durably for the same parent event and alert type", async () => {
    const eventId = await seedQuoteEvent();

    await database.query("select public.enqueue_quote_delivery_alert($1, $2, $3)", [
      eventId,
      "dead_letter",
      8,
    ]);
    await database.query("select public.enqueue_quote_delivery_alert($1, $2, $3)", [
      eventId,
      "dead_letter",
      8,
    ]);

    expect(await alertCount(eventId, "dead_letter")).toBe(1);
  });

  it("quarantines an alert after SMTP starts and never reclaims it", async () => {
    const eventId = await seedQuoteEvent();
    const [claimedEvent] = await claim(1);
    expect(await beginDelivery(eventId, claimedEvent.lock_token)).toBe(true);
    expect(await markDeliveryUnknown(eventId, claimedEvent.lock_token)).toBe(true);
    const [alert] = await claimAlerts(1);

    expect(await beginAlertDelivery(alert.id, alert.lock_token)).toBe(true);
    expect(await markAlertDeliveryUnknown(alert.id, alert.lock_token)).toBe(true);
    expect(await markAlertDeliveryUnknown(alert.id, alert.lock_token)).toBe(false);

    const state = await database.query<{
      delivery_started_at: string | null;
      delivery_unknown_at: string | null;
      locked_at: string | null;
      lock_token: string | null;
      next_attempt_at: string | null;
      status: string;
    }>(
      `select status, locked_at, lock_token, next_attempt_at,
        delivery_started_at, delivery_unknown_at
       from public.automation_alerts where id = $1`,
      [alert.id],
    );

    expect(state.rows[0]).toMatchObject({
      locked_at: null,
      lock_token: null,
      next_attempt_at: null,
      status: "delivery_unknown",
    });
    expect(state.rows[0].delivery_started_at).toBeTruthy();
    expect(state.rows[0].delivery_unknown_at).toBeTruthy();
    await expect(claimAlerts(1)).resolves.toEqual([]);
  });

  it("quarantines an expired alert lock after SMTP began without issuing another claim", async () => {
    const eventId = await seedQuoteEvent();
    const [claimedEvent] = await claim(1);
    expect(await beginDelivery(eventId, claimedEvent.lock_token)).toBe(true);
    expect(await markDeliveryUnknown(eventId, claimedEvent.lock_token)).toBe(true);
    const [alert] = await claimAlerts(1);
    expect(await beginAlertDelivery(alert.id, alert.lock_token)).toBe(true);

    await database.query(
      "update public.automation_alerts set locked_at = timezone('utc', now()) - interval '11 minutes' where id = $1",
      [alert.id],
    );
    await expect(claimAlerts(1)).resolves.toEqual([]);

    const state = await database.query<{ status: string }>(
      "select status from public.automation_alerts where id = $1",
      [alert.id],
    );
    expect(state.rows[0].status).toBe("delivery_unknown");
  });

  it("moves an alert to dead_letter after its eighth certain pre-SMTP failure", async () => {
    const eventId = await seedQuoteEvent();
    const [claimedEvent] = await claim(1);
    expect(await beginDelivery(eventId, claimedEvent.lock_token)).toBe(true);
    expect(await markDeliveryUnknown(eventId, claimedEvent.lock_token)).toBe(true);

    const [initialAlert] = await claimAlerts(1);
    await database.query(
      `update public.automation_alerts
       set status = 'pending', attempts = 7, locked_at = null, lock_token = null,
           next_attempt_at = timezone('utc', now()) - interval '1 second'
       where id = $1`,
      [initialAlert.id],
    );

    const [eighthClaim] = await claimAlerts(1);
    expect(eighthClaim).toMatchObject({ attempts: 8, id: initialAlert.id });
    const result = await database.query<{ disposition: string }>(
      "select public.reschedule_quote_delivery_alert_v3($1, $2, $3) as disposition",
      [initialAlert.id, eighthClaim.lock_token, "certain pre-SMTP failure number eight"],
    );

    expect(result.rows[0].disposition).toBe("dead_letter");
    const state = await database.query<{
      dead_lettered_at: string | null;
      next_attempt_at: string | null;
      status: string;
    }>(
      "select status, next_attempt_at, dead_lettered_at from public.automation_alerts where id = $1",
      [initialAlert.id],
    );
    expect(state.rows[0]).toMatchObject({ next_attempt_at: null, status: "dead_letter" });
    expect(state.rows[0].dead_lettered_at).toBeTruthy();
    await expect(claimAlerts(1)).resolves.toEqual([]);
  });

  it("does not claim catalogue events", async () => {
    await seedCatalogueEvent();

    await expect(claim()).resolves.toEqual([]);
  });

  it("restricts all quote worker RPCs to service_role with a safe search path", async () => {
    const privileges = await database.query<{
      anon_can_execute: boolean;
      authenticated_can_execute: boolean;
      public_can_execute: boolean;
      security_definer: boolean;
      service_role_can_execute: boolean;
      function_name: string;
      search_path: string[] | null;
    }>(
      `select
        procedure.proname as function_name,
        has_function_privilege('anon', procedure.oid, 'execute') as anon_can_execute,
        has_function_privilege('authenticated', procedure.oid, 'execute') as authenticated_can_execute,
        has_function_privilege('public', procedure.oid, 'execute') as public_can_execute,
        has_function_privilege('service_role', procedure.oid, 'execute') as service_role_can_execute,
        procedure.prosecdef as security_definer,
        procedure.proconfig as search_path
      from pg_proc procedure
      where procedure.oid in (
        'public.claim_quote_request_automation_events(integer)'::regprocedure,
        'public.begin_quote_request_automation_delivery(uuid, uuid)'::regprocedure,
        'public.mark_quote_request_automation_delivery_unknown(uuid, uuid, text)'::regprocedure,
        'public.mark_quote_request_automation_event_succeeded(uuid, uuid)'::regprocedure,
        'public.reschedule_quote_request_automation_event(uuid, uuid, text)'::regprocedure,
        'public.reschedule_quote_request_automation_event_v2(uuid, uuid, text)'::regprocedure,
        'public.claim_quote_delivery_alerts(integer)'::regprocedure,
        'public.begin_quote_delivery_alert_delivery(uuid, uuid)'::regprocedure,
        'public.mark_quote_delivery_alert_succeeded(uuid, uuid)'::regprocedure,
        'public.mark_quote_delivery_alert_delivery_unknown(uuid, uuid, text)'::regprocedure,
        'public.reschedule_quote_delivery_alert(uuid, uuid, text)'::regprocedure,
        'public.reschedule_quote_delivery_alert_v3(uuid, uuid, text)'::regprocedure
      )
      order by procedure.proname`,
    );

    expect(privileges.rows).toHaveLength(12);
    expect(privileges.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          function_name: "begin_quote_request_automation_delivery",
        }),
        expect.objectContaining({
          function_name: "mark_quote_request_automation_delivery_unknown",
        }),
        expect.objectContaining({
          function_name: "begin_quote_delivery_alert_delivery",
        }),
        expect.objectContaining({
          function_name: "mark_quote_delivery_alert_delivery_unknown",
        }),
        expect.objectContaining({
          function_name: "claim_quote_request_automation_events",
        }),
        expect.objectContaining({
          function_name: "mark_quote_request_automation_event_succeeded",
        }),
        expect.objectContaining({
          function_name: "reschedule_quote_request_automation_event",
        }),
        expect.objectContaining({
          function_name: "reschedule_quote_request_automation_event_v2",
        }),
        expect.objectContaining({
          function_name: "claim_quote_delivery_alerts",
        }),
        expect.objectContaining({
          function_name: "mark_quote_delivery_alert_succeeded",
        }),
        expect.objectContaining({
          function_name: "reschedule_quote_delivery_alert",
        }),
      ]),
    );

    for (const procedure of privileges.rows) {
      expect(procedure).toMatchObject({
        anon_can_execute: false,
        authenticated_can_execute: false,
        public_can_execute: false,
        security_definer: false,
        service_role_can_execute: true,
      });
      expect(procedure.search_path).toContain("search_path=public, pg_temp");
    }

    const alertsPermissions = await database.query<{
      anon_can_insert: boolean;
      anon_can_select: boolean;
      authenticated_can_insert: boolean;
      authenticated_can_select: boolean;
      rls_enabled: boolean;
      service_role_can_insert: boolean;
      service_role_can_select: boolean;
      service_role_can_update: boolean;
    }>(
      `select
        relation.relrowsecurity as rls_enabled,
        has_table_privilege('anon', relation.oid, 'select') as anon_can_select,
        has_table_privilege('anon', relation.oid, 'insert') as anon_can_insert,
        has_table_privilege('authenticated', relation.oid, 'select') as authenticated_can_select,
        has_table_privilege('authenticated', relation.oid, 'insert') as authenticated_can_insert,
        has_table_privilege('service_role', relation.oid, 'select') as service_role_can_select,
        has_table_privilege('service_role', relation.oid, 'insert') as service_role_can_insert,
        has_table_privilege('service_role', relation.oid, 'update') as service_role_can_update
      from pg_class relation
      where relation.oid = 'public.automation_alerts'::regclass`,
    );

    expect(alertsPermissions.rows).toEqual([
      {
        anon_can_insert: false,
        anon_can_select: false,
        authenticated_can_insert: false,
        authenticated_can_select: false,
        rls_enabled: true,
        service_role_can_insert: true,
        service_role_can_select: true,
        service_role_can_update: true,
      },
    ]);
  });
});
