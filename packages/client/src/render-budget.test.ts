import { describe, expect, it } from "vitest";

import {
  MAX_RENDER_DEVICE_PIXEL_RATIO,
  MAX_RENDER_PIXELS,
  resolveRenderCanvasSize
} from "./render-budget.js";

describe("render budget", () => {
  it("caps high-density displays to a lightweight render scale", () => {
    const size = resolveRenderCanvasSize({
      viewportWidth: 1280,
      viewportHeight: 720,
      devicePixelRatio: 3
    });

    expect(size).toEqual({
      width: Math.floor(1280 * MAX_RENDER_DEVICE_PIXEL_RATIO),
      height: Math.floor(720 * MAX_RENDER_DEVICE_PIXEL_RATIO)
    });
  });

  it("downscales oversized frame buffers to stay under the pixel budget", () => {
    const size = resolveRenderCanvasSize({
      viewportWidth: 2560,
      viewportHeight: 1440,
      devicePixelRatio: 2
    });

    expect(size.width * size.height).toBeLessThanOrEqual(MAX_RENDER_PIXELS);
    expect(size.width).toBeLessThan(Math.floor(2560 * MAX_RENDER_DEVICE_PIXEL_RATIO));
    expect(size.height).toBeLessThan(
      Math.floor(1440 * MAX_RENDER_DEVICE_PIXEL_RATIO)
    );
  });

  it("always returns a drawable canvas size", () => {
    const size = resolveRenderCanvasSize({
      viewportWidth: 0,
      viewportHeight: 0,
      devicePixelRatio: 0
    });

    expect(size).toEqual({
      width: 1,
      height: 1
    });
  });
});
