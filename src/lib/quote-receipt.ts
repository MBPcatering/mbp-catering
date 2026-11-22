import "server-only";

/**
 * The receipt must be explicitly enabled server-side. This prevents a future
 * workflow activation from sending receipts for historical quote requests.
 */
export function isQuoteReceiptEmailEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return env.QUOTE_RECEIPT_EMAIL_ENABLED === "true";
}
