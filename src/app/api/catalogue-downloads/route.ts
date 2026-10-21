import { NextResponse } from "next/server";
import { catalogueDownloadSchema } from "@/lib/catalogue-download";
import {
  persistCatalogueDownload,
  SubmissionPersistenceError,
} from "@/lib/lead-persistence";
import {
  createSubmissionContext,
  SubmissionSecurityConfigurationError,
} from "@/lib/submission-security";
import { SupabaseConfigurationError } from "@/lib/supabase-server";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid catalogue request" },
      { status: 400 },
    );
  }

  const result = catalogueDownloadSchema.safeParse(payload);
  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid catalogue request" },
      { status: 400 },
    );
  }

  try {
    const catalogueRequest = await persistCatalogueDownload(
      result.data,
      createSubmissionContext(request),
    );

    return NextResponse.json(
      {
        reference: catalogueRequest.reference,
        downloadUrl: "/documents/mbp-catering-catalogue-2026-2027.pdf",
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof SubmissionPersistenceError) {
      if (error.reason === "rate_limited") {
        return NextResponse.json(
          { error: "Too many requests" },
          { status: 429 },
        );
      }

      return NextResponse.json(
        { error: "Submission service unavailable" },
        { status: 503 },
      );
    }

    if (
      error instanceof SubmissionSecurityConfigurationError ||
      error instanceof SupabaseConfigurationError
    ) {
      return NextResponse.json(
        { error: "Submission service unavailable" },
        { status: 503 },
      );
    }

    throw error;
  }
}
