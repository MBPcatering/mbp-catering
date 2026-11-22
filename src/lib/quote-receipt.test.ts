import { describe, expect, it } from "vitest";

import { isQuoteReceiptEmailEnabled } from "./quote-receipt";

describe("quote receipt feature flag", () => {
  it("is disabled unless the server explicitly enables it", () => {
    expect(isQuoteReceiptEmailEnabled({})).toBe(false);
    expect(isQuoteReceiptEmailEnabled({ QUOTE_RECEIPT_EMAIL_ENABLED: "false" })).toBe(false);
    expect(isQuoteReceiptEmailEnabled({ QUOTE_RECEIPT_EMAIL_ENABLED: "true" })).toBe(true);
  });
});
