import { describe, expect, it } from "vitest";

import { quoteFormCopy } from "./form-copy";

describe("quote receipt confirmation copy", () => {
  it.each(["fr", "nl", "en"] as const)("includes a reference and conditional receipt message in %s", (locale) => {
    expect(quoteFormCopy[locale].reference).toContain("{reference}");
    expect(quoteFormCopy[locale].receiptEmailEnabled).toBeTruthy();
  });
});
