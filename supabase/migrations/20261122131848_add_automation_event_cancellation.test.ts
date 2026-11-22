import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "./20261122131848_add_automation_event_cancellation.sql",
  import.meta.url,
);
const monitoringMigrationUrl = new URL(
  "./20261028110000_add_automation_monitoring_heartbeats.sql",
  import.meta.url,
);

describe("automation event cancellation migration", () => {
  it("adds a service-role-only, terminal cancellation transition", async () => {
    const migration = await readFile(migrationUrl, "utf8");

    expect(migration).toMatch(/'cancelled'/);
    expect(migration).toMatch(
      /create or replace function public\.cancel_quote_request_automation_event\(/,
    );
    expect(migration).toMatch(/security invoker/);
    expect(migration).toMatch(/status = 'pending'/);
    expect(migration).toMatch(/attempts = 0/);
    expect(migration).toMatch(/delivery_started_at is null/);
    expect(migration).toMatch(/locked_at is null/);
    expect(migration).toMatch(/lock_token is null/);
    expect(migration).toMatch(/status = 'cancelled'/);
    expect(migration).toMatch(/next_attempt_at = null/);
    expect(migration).toMatch(/resolved_at = timezone\('utc', now\(\)\)/);
    expect(migration).toMatch(/resolution_note/);
    expect(migration).toMatch(/revoke all on function[\s\S]*from public, anon, authenticated/);
    expect(migration).toMatch(/grant execute on function[\s\S]*to service_role/);
  });

  it("keeps cancelled events outside overdue monitoring", async () => {
    const monitoringMigration = await readFile(monitoringMigrationUrl, "utf8");

    expect(monitoringMigration).toMatch(
      /where status in \('pending', 'failed'\)[\s\S]*next_attempt_at/,
    );
    expect(monitoringMigration).not.toMatch(/status in \([^)]*cancelled/);
  });
});
