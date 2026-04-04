export const MAX_RENDER_DEVICE_PIXEL_RATIO = 1.25;
export const MAX_RENDER_PIXELS = 3_000_000;

export type RenderCanvasSize = {
  width: number;
  height: number;
};

export function resolveRenderCanvasSize(options: {
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
}): RenderCanvasSize {
  const viewportWidth = Math.max(1, Math.floor(options.viewportWidth));
  const viewportHeight = Math.max(1, Math.floor(options.viewportHeight));
  const cappedPixelRatio = clamp(
    Number.isFinite(options.devicePixelRatio) ? options.devicePixelRatio : 1,
    1,
    MAX_RENDER_DEVICE_PIXEL_RATIO
  );

  let width = Math.max(1, Math.floor(viewportWidth * cappedPixelRatio));
  let height = Math.max(1, Math.floor(viewportHeight * cappedPixelRatio));
  const pixelCount = width * height;

  if (pixelCount > MAX_RENDER_PIXELS) {
    const scale = Math.sqrt(MAX_RENDER_PIXELS / pixelCount);
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));
  }

  return {
    width,
    height
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
