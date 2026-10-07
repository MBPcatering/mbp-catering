import { z } from "zod";

export const catalogueDownloadSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  company: z.string().optional(),
  phone: z.string().min(6),
  email: z.string().email(),
  consent: z.literal(true),
});

export type CatalogueDownloadRequest = z.infer<typeof catalogueDownloadSchema>;

export async function createCatalogueDownloadRequest(request: CatalogueDownloadRequest) {
  return {
    reference: `CAT-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    request,
  };
}
