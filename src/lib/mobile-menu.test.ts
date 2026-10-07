import { describe, expect, it } from "vitest";
import { getMobileMenuLabel } from "./mobile-menu";

describe("getMobileMenuLabel", () => {
  it("describes the action that the burger button will perform", () => {
    expect(getMobileMenuLabel(false)).toBe("Ouvrir le menu");
    expect(getMobileMenuLabel(true)).toBe("Fermer le menu");
  });
});
