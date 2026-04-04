import type { ConnectionDiagnostics } from "./session.js";

export type ClientDiagnosticsSnapshot = {
  fps: number | null;
  connection: ConnectionDiagnostics | null;
  serverTick: number | null;
  canvasPixels: { width: number; height: number } | null;
  dpr: number | null;
  memoryMb: number | null;
  sessionActive: boolean;
};

export function collectMemoryMb(): number | null {
  if (typeof performance === "undefined") {
    return null;
  }

  const memory = (
    performance as Performance & {
      memory?: { usedJSHeapSize: number };
    }
  ).memory;

  if (memory === undefined || typeof memory.usedJSHeapSize !== "number") {
    return null;
  }

  return Math.round((memory.usedJSHeapSize / (1024 * 1024)) * 10) / 10;
}

export function formatDiagnosticsLines(snapshot: ClientDiagnosticsSnapshot): string[] {
  const lines: string[] = [];

  lines.push(`FPS ${snapshot.fps === null ? "—" : String(snapshot.fps)}`);

  if (snapshot.canvasPixels !== null) {
    lines.push(
      `Canvas ${snapshot.canvasPixels.width}×${snapshot.canvasPixels.height}px`
    );
  }

  if (snapshot.dpr !== null) {
    lines.push(`DPR ${snapshot.dpr}`);
  }

  if (snapshot.connection !== null) {
    const transport =
      snapshot.connection.transport === "loopback" ? "loopback" : "socket";
    const link = snapshot.connection.connected ? "up" : "down";
    lines.push(`Net ${transport} · ${link}`);
  } else if (snapshot.sessionActive) {
    lines.push("Net —");
  } else {
    lines.push("Net idle");
  }

  if (snapshot.serverTick !== null) {
    lines.push(`Tick ${snapshot.serverTick}`);
  }

  if (snapshot.memoryMb !== null) {
    lines.push(`JS heap ~${snapshot.memoryMb} MB`);
  }

  return lines;
}

export type ClientDiagnosticsOverlay = {
  setEnabled(enabled: boolean): void;
  update(snapshot: ClientDiagnosticsSnapshot): void;
  dispose(): void;
};

export function mountClientDiagnosticsOverlay(
  overlayParent: HTMLElement
): ClientDiagnosticsOverlay {
  const panel = document.createElement("aside");
  panel.className = "client-diagnostics";
  panel.setAttribute("aria-label", "Runtime diagnostics");
  panel.hidden = true;

  const pre = document.createElement("pre");
  pre.className = "client-diagnostics-pre";
  panel.append(pre);
  overlayParent.append(panel);

  let lastSnapshot: ClientDiagnosticsSnapshot | null = null;

  const paint = (): void => {
    if (lastSnapshot === null) {
      return;
    }

    const lines = formatDiagnosticsLines(lastSnapshot);
    pre.textContent = lines.join("\n");
  };

  return {
    setEnabled(enabled: boolean): void {
      panel.hidden = !enabled;
      if (enabled) {
        paint();
      }
    },

    update(snapshot: ClientDiagnosticsSnapshot): void {
      lastSnapshot = snapshot;
      if (!panel.hidden) {
        paint();
      }
    },

    dispose(): void {
      panel.remove();
    }
  };
}
