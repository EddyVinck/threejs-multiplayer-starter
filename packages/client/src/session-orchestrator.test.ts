import { describe, expect, it, vi } from "vitest";

import { createSessionOrchestrator } from "./session-orchestrator.js";
import type { GameSession } from "./session.js";

function createFakeSession(label: string): GameSession & {
  readonly label: string;
  readonly stopSpy: ReturnType<typeof vi.fn>;
} {
  const stopSpy = vi.fn();

  return {
    label,
    stopSpy,
    getSessionJoined() {
      return null;
    },
    getLatestSnapshot() {
      return null;
    },
    submitPlayerCommand() {},
    subscribe() {
      return () => {};
    },
    stop() {
      stopSpy();
    },
    isStopped() {
      return stopSpy.mock.calls.length > 0;
    }
  };
}

describe("session orchestrator", () => {
  it("starts loopback sessions for the single-player path", async () => {
    const loopbackSession = createFakeSession("loopback");
    const startLoopbackSession = vi.fn(() => loopbackSession);
    const startRemoteSession = vi.fn();
    const orchestrator = createSessionOrchestrator({
      startLoopbackSession,
      startRemoteSession
    });

    const session = await orchestrator.startSession({
      mode: "single-player",
      displayName: "Eddy"
    });

    expect(session).toBe(loopbackSession);
    expect(orchestrator.getCurrentSession()).toBe(loopbackSession);
    expect(startLoopbackSession).toHaveBeenCalledWith({
      mode: "single-player",
      displayName: "Eddy"
    });
    expect(startRemoteSession).not.toHaveBeenCalled();
  });

  it("routes multiplayer requests through the remote starter and replaces the active session", async () => {
    const loopbackSession = createFakeSession("loopback");
    const remoteSession = createFakeSession("remote");
    const startLoopbackSession = vi.fn(() => loopbackSession);
    const startRemoteSession = vi.fn(async () => remoteSession);
    const orchestrator = createSessionOrchestrator({
      startLoopbackSession,
      startRemoteSession
    });

    await orchestrator.startSession({
      mode: "single-player"
    });

    const nextSession = await orchestrator.startSession({
      mode: "create-room",
      displayName: "Host",
      visibility: "private",
      lateJoinAllowed: true,
      serverUrl: "http://127.0.0.1:3000"
    });

    expect(nextSession).toBe(remoteSession);
    expect(orchestrator.getCurrentSession()).toBe(remoteSession);
    expect(loopbackSession.stopSpy).toHaveBeenCalledTimes(1);
    expect(startRemoteSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "create-room",
        displayName: "Host",
        visibility: "private",
        lateJoinAllowed: true,
        serverUrl: "http://127.0.0.1:3000",
        signal: expect.any(AbortSignal)
      })
    );
  });

  it("aborts stale starts and keeps the newest session active", async () => {
    const staleRemoteSession = createFakeSession("stale-remote");
    const freshLoopbackSession = createFakeSession("fresh-loopback");
    let resolveRemoteStart: ((session: GameSession) => void) | null = null;
    let staleSignal: AbortSignal | null = null;
    const startRemoteSession = vi.fn(
      (
        request: {
          signal?: AbortSignal;
        }
      ) =>
        new Promise<GameSession>((resolve) => {
          staleSignal = request.signal ?? null;
          resolveRemoteStart = resolve;
        })
    );
    const orchestrator = createSessionOrchestrator({
      startLoopbackSession: vi.fn(() => freshLoopbackSession),
      startRemoteSession
    });

    const staleStartPromise = orchestrator.startSession({
      mode: "quick-join"
    });
    const freshSessionPromise = orchestrator.startSession({
      mode: "single-player"
    });

    const capturedSignal: AbortSignal | null = staleSignal;
    const finishStaleStart: ((session: GameSession) => void) | null =
      resolveRemoteStart;

    expect(capturedSignal).not.toBeNull();
    expect(finishStaleStart).not.toBeNull();
    if (capturedSignal === null || finishStaleStart === null) {
      throw new Error("expected stale remote start to capture abort state");
    }

    const ensuredSignal: AbortSignal = capturedSignal;
    const completeStaleStart: (session: GameSession) => void =
      finishStaleStart;

    expect(ensuredSignal.aborted).toBe(true);

    completeStaleStart(staleRemoteSession);

    await expect(staleStartPromise).rejects.toMatchObject({
      name: "AbortError"
    });
    await expect(freshSessionPromise).resolves.toBe(freshLoopbackSession);
    expect(staleRemoteSession.stopSpy).toHaveBeenCalledTimes(1);
    expect(orchestrator.getCurrentSession()).toBe(freshLoopbackSession);
  });
});
