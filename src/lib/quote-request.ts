import { z } from "zod";

export const quoteRequestSchema = z.object({
  requestType: z.enum(["b2b", "private", "other"]),
  eventDate: z.string().min(1),
  eventTime: z.string().optional(),
  guestCount: z.coerce.number().int().positive(),
  address: z.string().min(4),
  services: z.array(z.string().min(1)).min(1),
  delivery: z.literal("delivery"),
  notes: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  company: z.string().optional(),
  phone: z.string().min(6),
  email: z.string().email(),
  consent: z.literal(true),
});

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export async function createQuoteRequest(request: QuoteRequest) {
  return { reference: `MBP-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, request };
}
