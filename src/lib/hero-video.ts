export const heroVideo = {
  src: "/hero-mbp-optimized.mp4",
  fallback: "Une table MBP Catering préparée avec soin",
} as const;

export function getHeroVideoSource(isAvailable: boolean) {
  return isAvailable ? heroVideo.src : undefined;
}
