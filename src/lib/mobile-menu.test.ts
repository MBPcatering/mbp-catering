import { describe, expect, it } from "vitest";
import { getMobileMenuClassName, getMobileMenuLabel } from "./mobile-menu";

describe("getMobileMenuLabel", () => {
  it("describes the action that the burger button will perform", () => {
    expect(getMobileMenuLabel(false)).toBe("Ouvrir le menu");
    expect(getMobileMenuLabel(true)).toBe("Fermer le menu");
  });

  it("adds the open state class only while the panel is open", () => {
    expect(getMobileMenuClassName(false)).toBe("mobile-menu");
    expect(getMobileMenuClassName(true)).toBe("mobile-menu is-open");
  });
});
