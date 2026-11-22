import "server-only";

export type AutomationWorker = "staging" | "alerts" | "receipt";
export type DispatchResult = "dispatched" | "failed" | "skipped";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok">>;

type DispatchOptions = {
  env?: Record<string, string | undefined>;
  fetcher?: Fetcher;
};

const N8N_HOST = "mbpcatering.app.n8n.cloud";
const DISPATCH_TIMEOUT_MS = 2_000;

function configurationFor(
  worker: AutomationWorker,
  env: Record<string, string | undefined>,
) {
  if (worker === "staging") {
    return {
        secret: env.N8N_STAGING_WEBHOOK_SECRET,
        url: env.N8N_STAGING_WEBHOOK_URL,
    };
  }

  if (worker === "alerts") {
    return {
        secret: env.N8N_ALERTS_WEBHOOK_SECRET,
        url: env.N8N_ALERTS_WEBHOOK_URL,
    };
  }

  return {
    secret: env.N8N_RECEIPT_WEBHOOK_SECRET,
    url: env.N8N_RECEIPT_WEBHOOK_URL,
  };
}

function isProductionN8nWebhook(url: string) {
  try {
    const target = new URL(url);
    return (
      target.protocol === "https:" &&
      target.hostname === N8N_HOST &&
      target.username === "" &&
      target.password === "" &&
      target.port === "" &&
      target.pathname.startsWith("/webhook/")
    );
  } catch {
    return false;
  }
}

function usesDedicatedSecret(
  worker: AutomationWorker,
  secret: string,
  env: Record<string, string | undefined>,
) {
  const otherWorkerSecrets = [
    worker === "staging" ? undefined : env.N8N_STAGING_WEBHOOK_SECRET,
    worker === "alerts" ? undefined : env.N8N_ALERTS_WEBHOOK_SECRET,
    worker === "receipt" ? undefined : env.N8N_RECEIPT_WEBHOOK_SECRET,
  ];

  return (
    secret !== env.N8N_AUTOMATION_SECRET &&
    !otherWorkerSecrets.includes(secret)
  );
}

/**
 * Sends only a wake-up signal. The worker claims its own event from the
 * durable Supabase outbox, so duplicate signals cannot cause duplicate mail.
 */
export async function dispatchN8nWorker(
  worker: AutomationWorker,
  options: DispatchOptions = {},
): Promise<DispatchResult> {
  const { env = process.env, fetcher = fetch } = options;
  const { secret, url } = configurationFor(worker, env);

  if (
    !secret ||
    !url ||
    !usesDedicatedSecret(worker, secret, env) ||
    !isProductionN8nWebhook(url)
  ) {
    return "skipped";
  }

  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });

    return response.ok ? "dispatched" : "failed";
  } catch {
    return "failed";
  }
}
