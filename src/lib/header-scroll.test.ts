import { describe, expect, it } from "vitest";
import { hasScrolledPastHeader } from "./header-scroll";

describe("hasScrolledPastHeader", () => {
  it("switches the header after the first pixels of scroll", () => {
    expect(hasScrolledPastHeader(0)).toBe(false);
    expect(hasScrolledPastHeader(8)).toBe(false);
    expect(hasScrolledPastHeader(9)).toBe(true);
  });
});
