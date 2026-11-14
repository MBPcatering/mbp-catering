import { z } from "zod";

const quoteRequestBaseSchema = z.object({
  requestType: z.enum(["b2b", "private", "other"]),
  eventDate: z.string().min(1),
  eventTime: z.string().optional(),
  eventType: z.string().trim().min(1).optional(),
  guestCount: z.coerce.number().int().positive(),
  address: z.string().min(4),
  services: z.array(z.string().min(1)).min(1),
  additionalServices: z.array(z.string().trim().min(1)).optional().default([]),
  delivery: z.literal("delivery"),
  notes: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  company: z.string().optional(),
  phone: z.string().min(6),
  email: z.string().email(),
  consent: z.literal(true),
});

export const quoteRequestSchema = quoteRequestBaseSchema.superRefine(
  (request, context) => {
    if (request.requestType === "b2b" && !request.company?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Company is required for B2B requests",
        path: ["company"],
      });
    }
  },
);

// Use the schema input so legacy callers may omit `additionalServices`; Zod
// still supplies its empty-array default after validation.
export type QuoteRequest = z.input<typeof quoteRequestSchema>;

export async function createQuoteRequest(request: QuoteRequest) {
  return {
    reference: `MBP-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    request,
  };
}
