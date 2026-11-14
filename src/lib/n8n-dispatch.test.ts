import { describe, expect, it, vi } from "vitest";

import { dispatchN8nWorker } from "./n8n-dispatch";

const stagingUrl = "https://mbpcatering.app.n8n.cloud/webhook/mbp-staging";

describe("n8n event dispatch", () => {
  it("sends an authenticated staging signal with no body", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true });

    await expect(
      dispatchN8nWorker("staging", {
        env: {
          N8N_STAGING_WEBHOOK_URL: stagingUrl,
          N8N_STAGING_WEBHOOK_SECRET: "staging-test-secret",
        },
        fetcher,
      }),
    ).resolves.toBe("dispatched");

    expect(fetcher).toHaveBeenCalledWith(
      stagingUrl,
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        redirect: "error",
        headers: expect.objectContaining({
          Authorization: "Bearer staging-test-secret",
        }),
      }),
    );
    expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
  });

  it("skips dispatch without a complete configuration", async () => {
    const fetcher = vi.fn();

    await expect(
      dispatchN8nWorker("staging", {
        env: { N8N_STAGING_WEBHOOK_URL: stagingUrl },
        fetcher,
      }),
    ).resolves.toBe("skipped");

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a configured URL containing credentials, a non-default port, or outside the webhook path", async () => {
    const fetcher = vi.fn();

    await expect(
      dispatchN8nWorker("staging", {
        env: {
          N8N_STAGING_WEBHOOK_URL:
            "https://accidental-secret@mbpcatering.app.n8n.cloud/not-a-webhook",
          N8N_STAGING_WEBHOOK_SECRET: "staging-test-secret",
        },
        fetcher,
      }),
    ).resolves.toBe("skipped");

    expect(fetcher).not.toHaveBeenCalled();

    await expect(
      dispatchN8nWorker("staging", {
        env: {
          N8N_STAGING_WEBHOOK_URL:
            "https://mbpcatering.app.n8n.cloud:8443/webhook/mbp-staging",
          N8N_STAGING_WEBHOOK_SECRET: "staging-test-secret",
        },
        fetcher,
      }),
    ).resolves.toBe("skipped");

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed when a worker secret reuses the automation or other worker secret", async () => {
    const fetcher = vi.fn();
    const base = { N8N_STAGING_WEBHOOK_URL: stagingUrl };

    await expect(
      dispatchN8nWorker("staging", {
        env: {
          ...base,
          N8N_STAGING_WEBHOOK_SECRET: "shared-secret",
          N8N_AUTOMATION_SECRET: "shared-secret",
        },
        fetcher,
      }),
    ).resolves.toBe("skipped");

    await expect(
      dispatchN8nWorker("staging", {
        env: {
          ...base,
          N8N_STAGING_WEBHOOK_SECRET: "shared-secret",
          N8N_ALERTS_WEBHOOK_SECRET: "shared-secret",
        },
        fetcher,
      }),
    ).resolves.toBe("skipped");

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("contains network failures without affecting the caller", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network unavailable"));

    await expect(
      dispatchN8nWorker("staging", {
        env: {
          N8N_STAGING_WEBHOOK_URL: stagingUrl,
          N8N_STAGING_WEBHOOK_SECRET: "staging-test-secret",
        },
        fetcher,
      }),
    ).resolves.toBe("failed");
  });

  it("permits duplicate signals without sending business data", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    const options = {
      env: {
        N8N_STAGING_WEBHOOK_URL: stagingUrl,
        N8N_STAGING_WEBHOOK_SECRET: "staging-test-secret",
      },
      fetcher,
    };

    await dispatchN8nWorker("staging", options);
    await dispatchN8nWorker("staging", options);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(([, init]) => init?.body)).toEqual([
      undefined,
      undefined,
    ]);
  });
});
