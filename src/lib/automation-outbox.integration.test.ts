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
        payload, status, next_attempt_at, locked_at, lock_token
      ) values (
        $1, 'quote_request.created', $2, $3, '{"request":"test"}'::jsonb,
        $4, coalesce($5::timestamptz, timezone('utc', now())), $6::timestamptz, gen_random_uuid()
      ) returning id`,
      [
        quote.rows[0].id,
        `quote-${randomUUID()}`,
        testFingerprint,
        options?.status ?? "pending",
        options?.nextAttemptAt ?? null,
        options?.lockedAt ?? null,
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

  it("releases an expired lock with a new token and rejects stale completion", async () => {
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
        'public.mark_quote_request_automation_event_succeeded(uuid, uuid)'::regprocedure,
        'public.reschedule_quote_request_automation_event(uuid, uuid, text)'::regprocedure
      )
      order by procedure.proname`,
    );

    expect(privileges.rows).toHaveLength(3);
    expect(privileges.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          function_name: "claim_quote_request_automation_events",
        }),
        expect.objectContaining({
          function_name: "mark_quote_request_automation_event_succeeded",
        }),
        expect.objectContaining({
          function_name: "reschedule_quote_request_automation_event",
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
  });
});
