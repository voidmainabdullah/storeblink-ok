export interface AnimationSystemAPI {
  durationForDistance(distancePx: number, pixelsPerSecond: number): number;
  prefersReducedMotion(): boolean;
}

const finitePositive = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? value : fallback;

export class AnimationSystem implements AnimationSystemAPI {
  durationForDistance(distancePx: number, pixelsPerSecond: number): number {
    const distance = finitePositive(distancePx, 1);
    const speed = finitePositive(pixelsPerSecond, 48);
    return distance / speed;
  }

  prefersReducedMotion(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }
}

export const animationSystem = new AnimationSystem();
