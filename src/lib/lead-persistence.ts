import "server-only";
import { CatalogueDownloadRequest } from "./catalogue-download";
import { QuoteRequest } from "./quote-request";
import { createSupabaseServerClient } from "./supabase-server";

type RpcResult = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

export type LeadPersistenceClient = {
  rpc: (
    functionName: string,
    parameters: Record<string, unknown>,
  ) => Promise<RpcResult>;
};

export type SubmissionContext = {
  idempotencyKey: string;
  sourceFingerprint: string;
};

type PersistedSubmission = {
  automationEventId: string;
  duplicate: boolean;
  reference: string;
};

export class SubmissionPersistenceError extends Error {
  constructor(
    public readonly reason: "rate_limited" | "unavailable",
    message: string,
  ) {
    super(message);
    this.name = "SubmissionPersistenceError";
  }
}

function getClient() {
  return createSupabaseServerClient() as unknown as LeadPersistenceClient;
}

function readPersistedSubmission(data: unknown): PersistedSubmission {
  const row = Array.isArray(data) ? data[0] : data;

  if (
    !row ||
    typeof row !== "object" ||
    typeof (row as Record<string, unknown>).reference !== "string" ||
    typeof (row as Record<string, unknown>).automation_event_id !== "string" ||
    typeof (row as Record<string, unknown>).duplicate !== "boolean"
  ) {
    throw new SubmissionPersistenceError(
      "unavailable",
      "Supabase returned an invalid submission response",
    );
  }

  const submission = row as {
    automation_event_id: string;
    duplicate: boolean;
    reference: string;
  };

  return {
    automationEventId: submission.automation_event_id,
    duplicate: submission.duplicate,
    reference: submission.reference,
  };
}

async function persistSubmission(
  functionName: string,
  request: QuoteRequest | CatalogueDownloadRequest,
  context: SubmissionContext,
  client = getClient(),
) {
  const { data, error } = await client.rpc(functionName, {
    p_idempotency_key: context.idempotencyKey,
    p_request: request,
    p_source_fingerprint: context.sourceFingerprint,
  });

  if (error) {
    if (error.code === "P0001" && error.message.includes("RATE_LIMITED")) {
      throw new SubmissionPersistenceError("rate_limited", error.message);
    }

    throw new SubmissionPersistenceError("unavailable", error.message);
  }

  return readPersistedSubmission(data);
}

export function persistQuoteRequest(
  request: QuoteRequest,
  context: SubmissionContext,
  client?: LeadPersistenceClient,
) {
  return persistSubmission(
    "create_quote_request_with_event",
    request,
    context,
    client,
  );
}

export function persistCatalogueDownload(
  request: CatalogueDownloadRequest,
  context: SubmissionContext,
  client?: LeadPersistenceClient,
) {
  return persistSubmission(
    "create_catalogue_download_with_event",
    request,
    context,
    client,
  );
}
