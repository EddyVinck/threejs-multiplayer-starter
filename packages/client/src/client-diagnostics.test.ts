import { describe, expect, it } from "vitest";

import {
  formatDiagnosticsLines,
  type ClientDiagnosticsSnapshot
} from "./client-diagnostics.js";

function baseSnapshot(
  overrides: Partial<ClientDiagnosticsSnapshot> = {}
): ClientDiagnosticsSnapshot {
  return {
    fps: null,
    connection: null,
    serverTick: null,
    canvasPixels: null,
    dpr: null,
    memoryMb: null,
    sessionActive: false,
    ...overrides
  };
}

describe("client diagnostics", () => {
  it("formats loopback connection and tick lines", () => {
    const lines = formatDiagnosticsLines(
      baseSnapshot({
        fps: 60,
        connection: { transport: "loopback", connected: true },
        serverTick: 42,
        canvasPixels: { width: 1280, height: 720 },
        dpr: 2,
        sessionActive: true
      })
    );

    expect(lines).toContain("FPS 60");
    expect(lines.some((l) => l.includes("Canvas 1280×720px"))).toBe(true);
    expect(lines).toContain("DPR 2");
    expect(lines.some((l) => l.includes("loopback"))).toBe(true);
    expect(lines).toContain("Tick 42");
  });

  it("formats websocket down state", () => {
    const lines = formatDiagnosticsLines(
      baseSnapshot({
        connection: { transport: "websocket", connected: false },
        sessionActive: true
      })
    );

    expect(lines.some((l) => l.includes("socket") && l.includes("down"))).toBe(
      true
    );
  });

  it("shows idle net line when no connection snapshot exists", () => {
    const lines = formatDiagnosticsLines(baseSnapshot());
    expect(lines.some((l) => l.includes("Net idle"))).toBe(true);
  });

  it("includes memory line when provided", () => {
    const lines = formatDiagnosticsLines(
      baseSnapshot({
        memoryMb: 12.3
      })
    );
    expect(lines.some((l) => l.includes("12.3") && l.includes("JS heap"))).toBe(
      true
    );
  });
});
