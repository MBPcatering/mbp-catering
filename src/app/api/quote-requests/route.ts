import { NextResponse } from "next/server";
import { createQuoteRequest, quoteRequestSchema } from "@/lib/quote-request";
import { evaluateQuoteRequest } from "@/lib/quote-rules";

export async function POST(request: Request) {
  const result = quoteRequestSchema.safeParse(await request.json());
  if (!result.success)
    return NextResponse.json(
      { error: "Invalid quote request" },
      { status: 400 },
    );

  const eligibility = evaluateQuoteRequest(result.data);
  if (!eligibility.eligible)
    return NextResponse.json({ error: eligibility.reason }, { status: 422 });

  const quoteRequest = await createQuoteRequest(result.data);
  return NextResponse.json(
    { reference: quoteRequest.reference },
    { status: 201 },
  );
}
