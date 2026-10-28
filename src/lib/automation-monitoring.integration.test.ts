import { randomUUID } from "node:crypto";
import { Client } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

const databaseUrl = process.env.SUPABASE_TEST_DB_URL;
const describeLocal = databaseUrl ? describe : describe.skip;

type Snapshot = {
  dead_letter: number;
  delivery_unknown: number;
  expired_alert_locks: number;
  expired_event_locks: number;
  expected_active_workflows: number;
  high_attempts: number;
  overdue_alerts: number;
  overdue_events: number;
  stale_heartbeats: number;
};

describeLocal("automation monitoring database contract", () => {
  const database = new Client({ connectionString: databaseUrl });
  const testFingerprint = `monitoring-${randomUUID()}`;

  beforeAll(async () => {
    await database.connect();
  });

  beforeEach(async () => {
    // Keep monitoring fixtures invisible to parallel outbox tests: the claim
    // RPC intentionally selects every eligible event in the shared local DB.
    await database.query("begin");
  });

  afterEach(async () => {
    await database.query("rollback");
  });

  afterAll(async () => {
    await database.end();
  });

  async function seedEvent(options: {
    attempts?: number;
    lockedAt?: string | null;
    nextAttemptAt?: string | null;
    status: "dead_letter" | "delivery_unknown" | "failed" | "pending" | "processing";
  }) {
    const quote = await database.query<{ id: string }>(
      `insert into public.quote_requests (
        request_type, event_date, guest_count, address, services, delivery,
        first_name, last_name, phone, email, source_fingerprint
      ) values (
        'b2b', current_date + 30, 10, 'Rue de Test 1, 1000 Bruxelles',
        array['lunch'], 'delivery', 'Monitor', 'Test', '+3225550000',
        $2, $1
      ) returning id`,
      [testFingerprint, `monitor-${randomUUID()}@example.test`],
    );

    const event = await database.query<{ id: string }>(
      `insert into public.automation_events (
        quote_request_id, event_type, idempotency_key, source_fingerprint,
        payload, status, attempts, next_attempt_at, locked_at, lock_token,
        delivery_unknown_at, dead_lettered_at
      ) values (
        $1, 'quote_request.created', $2, $3, '{}'::jsonb, $4, $5,
        $6::timestamptz, $7::timestamptz,
        case when $7::timestamptz is null then null else gen_random_uuid() end,
        case when $4 = 'delivery_unknown' then timezone('utc', now()) else null end,
        case when $4 = 'dead_letter' then timezone('utc', now()) else null end
      ) returning id`,
      [
        quote.rows[0].id,
        `monitor-${randomUUID()}`,
        testFingerprint,
        options.status,
        options.attempts ?? 0,
        options.nextAttemptAt ?? null,
        options.lockedAt ?? null,
      ],
    );

    return event.rows[0].id;
  }

  it("records an idempotent heartbeat for a whitelisted workflow only", async () => {
    const first = await database.query<{ accepted: boolean }>(
      "select public.record_automation_heartbeat($1) as accepted",
      ["staging"],
    );
    const second = await database.query<{ accepted: boolean }>(
      "select public.record_automation_heartbeat($1) as accepted",
      ["staging"],
    );

    expect(first.rows[0].accepted).toBe(true);
    expect(second.rows[0].accepted).toBe(true);

    const heartbeat = await database.query<{
      count: string;
      last_heartbeat_at: string | null;
      technical_state: string;
    }>(
      `select count(*)::text as count, max(last_heartbeat_at)::text as last_heartbeat_at,
        max(technical_state) as technical_state
       from public.automation_heartbeats
       where workflow_key = 'staging'`,
    );

    expect(heartbeat.rows[0]).toMatchObject({
      count: "1",
      technical_state: "cycle_started",
    });
    expect(heartbeat.rows[0].last_heartbeat_at).toBeTruthy();
  });

  it("reports only expected workflows and detects a stale heartbeat", async () => {
    await database.query(`
      update public.automation_heartbeats
      set expected_active = true,
          last_heartbeat_at = timezone('utc', now()) - interval '16 minutes',
          technical_state = 'cycle_started'
      where workflow_key = 'alerts'
    `);

    const result = await database.query<{ snapshot: Snapshot }>(
      `select public.get_automation_monitoring_snapshot(900, 600, 6) as snapshot`,
    );

    expect(result.rows[0].snapshot).toMatchObject({
      expected_active_workflows: 1,
      stale_heartbeats: 1,
    });
  });

  it("treats a future expected heartbeat as incoherent and rejects null thresholds", async () => {
    await database.query(`
      update public.automation_heartbeats
      set expected_active = true,
          last_heartbeat_at = timezone('utc', now()) + interval '16 minutes',
          technical_state = 'cycle_started'
      where workflow_key = 'staging'
    `);

    const futureHeartbeat = await database.query<{ snapshot: Snapshot }>(
      `select public.get_automation_monitoring_snapshot(900, 600, 6) as snapshot`,
    );
    expect(futureHeartbeat.rows[0].snapshot.stale_heartbeats).toBe(1);

    await expect(
      database.query(
        `select public.get_automation_monitoring_snapshot(null, 600, 6)`,
      ),
    ).rejects.toMatchObject({ code: "22023" });
  });

  it("accepts concurrent idempotent heartbeats for one whitelisted workflow", async () => {
    const first = new Client({ connectionString: databaseUrl });
    const second = new Client({ connectionString: databaseUrl });
    await Promise.all([first.connect(), second.connect()]);

    try {
      const recordAndRollback = async (connection: Client) => {
        await connection.query("begin");
        try {
          return await connection.query<{ accepted: boolean }>(
            "select public.record_automation_heartbeat('alerts') as accepted",
          );
        } finally {
          await connection.query("rollback");
        }
      };
      const [left, right] = await Promise.all([
        recordAndRollback(first),
        recordAndRollback(second),
      ]);

      expect(left.rows[0].accepted).toBe(true);
      expect(right.rows[0].accepted).toBe(true);
    } finally {
      await Promise.all([first.end(), second.end()]);
    }
  });

  it("aggregates overdue work, expired locks, terminal delivery states, and high attempts", async () => {
    const overdueEventId = await seedEvent({
      status: "failed",
      attempts: 6,
      nextAttemptAt: "2000-01-01T00:00:00Z",
    });
    const expiredEventId = await seedEvent({
      status: "processing",
      attempts: 6,
      lockedAt: "2000-01-01T00:00:00Z",
    });
    await seedEvent({ status: "delivery_unknown" });
    await seedEvent({ status: "dead_letter", attempts: 8 });

    await database.query(
      `insert into public.automation_alerts (
        automation_event_id, alert_type, idempotency_key, payload, status,
        attempts, next_attempt_at, locked_at, lock_token
      ) values (
        $1, 'dead_letter', $2, '{}'::jsonb, 'processing', 6,
        '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z', gen_random_uuid()
      )`,
      [expiredEventId, `monitor-alert-${randomUUID()}`],
    );
    await database.query(
      `insert into public.automation_alerts (
        automation_event_id, alert_type, idempotency_key, payload, status,
        attempts, next_attempt_at
      ) values (
        $1, 'delivery_unknown', $2, '{}'::jsonb, 'failed', 6,
        '2000-01-01T00:00:00Z'
      )`,
      [overdueEventId, `monitor-alert-${randomUUID()}`],
    );

    const result = await database.query<{ snapshot: Snapshot }>(
      `select public.get_automation_monitoring_snapshot(900, 600, 6) as snapshot`,
    );

    expect(result.rows[0].snapshot).toMatchObject({
      overdue_events: 1,
      overdue_alerts: 1,
      expired_event_locks: 1,
      expired_alert_locks: 1,
      delivery_unknown: 1,
      dead_letter: 1,
      high_attempts: 4,
    });
  });
});
