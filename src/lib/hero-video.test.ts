import { describe, expect, it } from "vitest";
import { getHeroVideoSource, heroVideo } from "./hero-video";

describe("heroVideo", () => {
  it("points to the future local hero video and provides a fallback description", () => {
    expect(heroVideo.src).toBe("/videos/mbp-hero.mp4");
    expect(heroVideo.fallback).toBe("Une table MBP Catering préparée avec soin");
  });

  it("uses the video source only when the asset exists", () => {
    expect(getHeroVideoSource(true)).toBe("/videos/mbp-hero.mp4");
    expect(getHeroVideoSource(false)).toBeUndefined();
  });
});
