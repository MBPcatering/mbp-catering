import { NextResponse } from "next/server";
import {
  catalogueDownloadSchema,
  createCatalogueDownloadRequest,
} from "@/lib/catalogue-download";

export async function POST(request: Request) {
  const result = catalogueDownloadSchema.safeParse(await request.json());
  if (!result.success)
    return NextResponse.json(
      { error: "Invalid catalogue request" },
      { status: 400 },
    );

  const catalogueRequest = await createCatalogueDownloadRequest(result.data);
  return NextResponse.json(
    {
      reference: catalogueRequest.reference,
      downloadUrl: "/documents/mbp-catering-catalogue-2026-2027.pdf",
    },
    { status: 201 },
  );
}
