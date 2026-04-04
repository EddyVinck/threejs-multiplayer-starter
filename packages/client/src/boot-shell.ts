import {
  describeInitialBootStatus,
  type BootStatusViewModel
} from "./boot-status.js";
import { resolveRenderCanvasSize } from "./render-budget.js";
import type { SessionEntryResolution } from "./session-entry.js";

export type ClientBootShell = {
  canvas: HTMLCanvasElement;
  overlayRoot: HTMLDivElement;
  setStatus(status: BootStatusViewModel): void;
  dispose(): void;
};

export function mountClientBootShell(options: {
  appRoot: HTMLElement;
  resolution: SessionEntryResolution;
}): ClientBootShell {
  const { appRoot, resolution } = options;
  const shell = document.createElement("div");
  shell.className = "client-shell";

  const backdropCanvas = document.createElement("canvas");
  backdropCanvas.className = "boot-backdrop";
  backdropCanvas.setAttribute("aria-hidden", "true");

  const canvas = document.createElement("canvas");
  canvas.className = "game-canvas";
  canvas.id = "game-canvas";
  canvas.setAttribute("aria-label", "Game render surface");

  const overlayRoot = document.createElement("div");
  overlayRoot.className = "overlay-root";
  overlayRoot.id = "overlay-root";

  const bootPanel = document.createElement("section");
  bootPanel.className = "boot-panel";
  bootPanel.setAttribute("aria-live", "polite");

  const badge = document.createElement("p");
  badge.className = "boot-badge";

  const title = document.createElement("h1");
  title.className = "boot-title";

  const detail = document.createElement("p");
  detail.className = "boot-detail";

  bootPanel.append(badge, title, detail);
  overlayRoot.append(bootPanel);
  shell.append(backdropCanvas, canvas, overlayRoot);
  appRoot.replaceChildren(shell);

  const resizeCanvases = () => {
    const nextSize = resolveRenderCanvasSize({
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    });

    if (canvas.width !== nextSize.width || canvas.height !== nextSize.height) {
      canvas.width = nextSize.width;
      canvas.height = nextSize.height;
    }

    if (
      backdropCanvas.width !== nextSize.width ||
      backdropCanvas.height !== nextSize.height
    ) {
      backdropCanvas.width = nextSize.width;
      backdropCanvas.height = nextSize.height;
    }

    paintBootBackdrop(backdropCanvas);
  };

  const setStatus = (status: BootStatusViewModel) => {
    badge.textContent = status.badge;
    title.textContent = status.title;
    detail.textContent = status.detail;
  };

  resizeCanvases();
  window.addEventListener("resize", resizeCanvases);
  setStatus(describeInitialBootStatus(resolution));

  return {
    canvas,
    overlayRoot,
    setStatus,
    dispose() {
      window.removeEventListener("resize", resizeCanvases);
    }
  };
}

function paintBootBackdrop(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext("2d");
  if (context === null) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;
  const horizonY = Math.floor(height * 0.58);

  const skyGradient = context.createLinearGradient(0, 0, 0, height);
  skyGradient.addColorStop(0, "#162647");
  skyGradient.addColorStop(0.58, "#0b1220");
  skyGradient.addColorStop(1, "#05070d");

  context.fillStyle = skyGradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(109, 170, 255, 0.1)";
  for (let index = 0; index < 3; index += 1) {
    const size = Math.max(40, Math.floor(width * (0.06 + index * 0.03)));
    const x = Math.floor(width * (0.16 + index * 0.2));
    const y = Math.floor(horizonY - size * 0.65);
    context.fillRect(x, y, size, size * 0.65);
  }

  context.strokeStyle = "rgba(146, 188, 255, 0.16)";
  context.lineWidth = Math.max(1, Math.floor(width / 900));
  for (let row = 0; row < 7; row += 1) {
    const y = horizonY + row * Math.max(24, Math.floor(height * 0.045));
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  const pickupColor = "rgba(137, 243, 181, 0.9)";
  const pickupSize = Math.max(6, Math.floor(width / 240));
  const pickupPositions = [0.26, 0.49, 0.72];
  context.fillStyle = pickupColor;
  for (const xRatio of pickupPositions) {
    context.fillRect(
      Math.floor(width * xRatio),
      Math.floor(horizonY + height * 0.09),
      pickupSize,
      pickupSize
    );
  }
}
