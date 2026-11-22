import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(__dirname, "20261122162058_add_quote_request_receipts.sql"),
  "utf8",
);

describe("quote receipt migration", () => {
  it("creates an idempotent receipt event only when the server flag is set", () => {
    expect(migration).toContain("'quote_request.receipt.created'");
    expect(migration).toContain("v_receipt_enabled boolean := p_request ->> 'receiptEnabled' = 'true'");
    expect(migration).toContain("v_is_urgent boolean := coalesce(");
    expect(migration).toContain("v_quote.id::text || ':quote_request.receipt.created'");
  });

  it("keeps uncertain receipt delivery terminal and excludes it from retries", () => {
    expect(migration).toContain("status = 'delivery_unknown'");
    expect(migration).toContain("next_attempt_at = null");
    expect(migration).toContain("when delivery_started_at is not null then 'delivery_unknown'");
  });

  it("limits receipt RPC execution to service_role", () => {
    expect(migration).toContain("revoke all on function public.claim_quote_request_receipt_events(integer) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.claim_quote_request_receipt_events(integer) to service_role");
  });
});
