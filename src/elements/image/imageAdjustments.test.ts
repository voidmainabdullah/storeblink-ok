import { describe, expect, it } from "vitest";
import {
  getImageChannelTransfer,
  getImageSaturation,
  readImageAdjustments,
  readImageEffects,
} from "./imageAdjustments";

describe("image adjustments", () => {
  it("normalizes persisted values into safe renderer ranges", () => {
    const adjustments = readImageAdjustments({
      opacity: 240,
      exposure: -500,
      blur: -2,
      sharpness: 400,
    });
    expect(adjustments).toMatchObject({
      opacity: 100,
      exposure: -100,
      blur: 0,
      sharpness: 100,
    });
  });

  it("produces finite channel transfer and saturation values", () => {
    const adjustments = readImageAdjustments({
      exposure: 25,
      brightness: 10,
      contrast: 15,
      saturation: 20,
      vibrance: 30,
      temperature: 40,
      tint: -25,
    });
    const channels = getImageChannelTransfer(adjustments);
    expect(channels.r.slope).toBeGreaterThan(0);
    expect(channels.g.intercept).toBeTypeOf("number");
    expect(channels.b.slope).toBeGreaterThan(0);
    expect(getImageSaturation(adjustments)).toBeGreaterThan(1);
  });

  it("normalizes image effect strength and blend mode", () => {
    expect(readImageEffects({ noise: 120, glass: -1, blendMode: "multiply" })).toMatchObject({
      noise: 100,
      glass: 0,
      blendMode: "multiply",
    });
  });
});
