import { describe, expect, it } from "vitest";
import { galleryImages } from "./gallery";

describe("galleryImages", () => {
  it("exposes every local catering photo with an accessible description", () => {
    expect(galleryImages).toEqual([
      {
        src: "/photo1.JPG",
        alt: "Préparation culinaire MBP Catering",
      },
      {
        src: "/photo2.jpg",
        alt: "Buffet coloré préparé par MBP Catering",
      },
      {
        src: "/photo3.JPG",
        alt: "Détail d’une table MBP Catering",
      },
      {
        src: "/photo4.JPG",
        alt: "Service traiteur MBP Catering",
      },
    ]);
  });
});
