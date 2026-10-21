import { afterEach, describe, expect, it } from "vitest";
import {
  createSourceFingerprint,
  createSubmissionContext,
  SubmissionSecurityConfigurationError,
} from "./submission-security";

const originalFingerprintSecret = process.env.SUBMISSION_FINGERPRINT_SECRET;

afterEach(() => {
  if (originalFingerprintSecret) {
    process.env.SUBMISSION_FINGERPRINT_SECRET = originalFingerprintSecret;
  } else {
    delete process.env.SUBMISSION_FINGERPRINT_SECRET;
  }
});

describe("submission security", () => {
  it("hashes the source address without persisting it in plain text", () => {
    const fingerprint = createSourceFingerprint("203.0.113.10", "test-secret");

    expect(fingerprint).toHaveLength(64);
    expect(fingerprint).not.toContain("203.0.113.10");
    expect(fingerprint).toBe(
      createSourceFingerprint("203.0.113.10", "test-secret"),
    );
  });

  it("preserves a valid idempotency key from the caller", () => {
    process.env.SUBMISSION_FINGERPRINT_SECRET = "test-secret";
    const request = new Request("http://localhost/api/quote-requests", {
      headers: {
        "idempotency-key": "quote-request-2026-0001",
        "x-forwarded-for": "203.0.113.10",
      },
    });

    expect(createSubmissionContext(request)).toMatchObject({
      idempotencyKey: "quote-request-2026-0001",
    });
  });

  it("refuses to operate without a server-side fingerprint secret", () => {
    delete process.env.SUBMISSION_FINGERPRINT_SECRET;
    const request = new Request("http://localhost/api/quote-requests");

    expect(() => createSubmissionContext(request)).toThrow(
      SubmissionSecurityConfigurationError,
    );
  });
});
