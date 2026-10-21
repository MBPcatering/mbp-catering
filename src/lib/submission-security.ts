import "server-only";
import { createHmac, randomUUID } from "node:crypto";

export class SubmissionSecurityConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmissionSecurityConfigurationError";
  }
}

const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{16,200}$/;

export function createSourceFingerprint(ipAddress: string, secret: string) {
  return createHmac("sha256", secret).update(ipAddress).digest("hex");
}

function getClientIp(request: Request) {
  return (
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function createSubmissionContext(request: Request) {
  const fingerprintSecret = process.env.SUBMISSION_FINGERPRINT_SECRET;

  if (!fingerprintSecret) {
    throw new SubmissionSecurityConfigurationError(
      "Missing required environment variable: SUBMISSION_FINGERPRINT_SECRET",
    );
  }

  const providedKey = request.headers.get("idempotency-key");
  const idempotencyKey =
    providedKey && idempotencyKeyPattern.test(providedKey)
      ? providedKey
      : randomUUID();

  return {
    idempotencyKey,
    sourceFingerprint: createSourceFingerprint(
      getClientIp(request),
      fingerprintSecret,
    ),
  };
}
