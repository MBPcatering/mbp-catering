import { NextResponse } from "next/server";
import {
  persistQuoteRequest,
  SubmissionPersistenceError,
} from "@/lib/lead-persistence";
import { quoteRequestSchema } from "@/lib/quote-request";
import { evaluateQuoteRequest } from "@/lib/quote-rules";
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
      { error: "Invalid quote request" },
      { status: 400 },
    );
  }

  const result = quoteRequestSchema.safeParse(payload);
  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid quote request" },
      { status: 400 },
    );
  }

  const eligibility = evaluateQuoteRequest(result.data);
  if (!eligibility.eligible)
    return NextResponse.json({ error: eligibility.reason }, { status: 422 });

  try {
    const quoteRequest = await persistQuoteRequest(
      result.data,
      createSubmissionContext(request),
    );

    return NextResponse.json(
      { reference: quoteRequest.reference },
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
