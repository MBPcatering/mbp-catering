const DEFAULT_URL = "https://mbp-catering.vercel.app/api/internal/monitoring/status";
const DEFAULT_TIMEOUT_MS = 10_000;

export class MonitoringCheckError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export async function checkAutomationMonitoring({
  fetchFn = fetch,
  secret,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  url = DEFAULT_URL,
}) {
  if (!secret) {
    throw new MonitoringCheckError("missing_secret", "MONITOR_SECRET is required");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Cache-Control": "no-cache",
      },
      method: "GET",
      signal: controller.signal,
    });

    if (response.status !== 200) {
      throw new MonitoringCheckError("http_status", `unexpected HTTP status ${response.status}`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new MonitoringCheckError("invalid_json", "monitoring response is not valid JSON");
    }

    if (!payload || typeof payload !== "object" || typeof payload.status !== "string") {
      throw new MonitoringCheckError("invalid_response", "monitoring response has no status");
    }

    if (payload.status !== "healthy") {
      throw new MonitoringCheckError("unexpected_status", `monitoring status is ${payload.status}`);
    }

    return { status: "healthy" };
  } catch (error) {
    if (error instanceof MonitoringCheckError) {
      throw error;
    }

    if (error?.name === "AbortError") {
      throw new MonitoringCheckError("timeout", "monitoring request timed out");
    }

    throw new MonitoringCheckError("network_error", "monitoring request failed");
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  try {
    await checkAutomationMonitoring({ secret: process.env.MONITOR_SECRET });
    console.log("automation monitoring: healthy");
  } catch (error) {
    const message = error instanceof Error ? error.message : "monitoring check failed";
    console.error(`automation monitoring check failed: ${message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
