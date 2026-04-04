import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  defaultSampleModeConfig,
  defaultSimulationRules,
  type PlayerCommand
} from "@gamejam/shared";

import { createLoopbackSession } from "./loopback-session.js";
import type { GameSessionEvent } from "./session.js";

function createMoveCommand(sequence: number): PlayerCommand {
  return {
    sequence,
    deltaMs: 50,
    move: { x: 1, y: 0, z: 0 },
    look: { yaw: 90, pitch: 0 },
    actions: {
      jump: false,
      primary: false,
      secondary: false
    }
  };
}

describe("loopback session", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("replays the joined state and initial authoritative snapshot to new subscribers", () => {
    const session = createLoopbackSession({
      displayName: "Eddy"
    });
    const events: GameSessionEvent[] = [];

    session.subscribe((event) => {
      events.push(event);
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "joined",
      joined: {
        mode: "single-player",
        playerId: "local-player",
        roomId: "loopback-room",
        roomCode: "PLAYER",
        visibility: "private",
        lateJoin: false
      }
    });
    expect(events[1]).toMatchObject({
      type: "snapshot",
      snapshot: {
        mode: "single-player",
        roomId: "loopback-room",
        roomCode: "PLAYER",
        arena: defaultSampleModeConfig.arena,
        rules: defaultSampleModeConfig.rules
      }
    });
    expect(session.getLatestSnapshot()?.players[0]?.displayName).toBe("Eddy");

    session.stop();
  });

  it("emits deltas from the local authoritative tick loop after commands are submitted", () => {
    const session = createLoopbackSession();
    const events: GameSessionEvent[] = [];

    session.subscribe((event) => {
      events.push(event);
    });
    session.submitPlayerCommand(createMoveCommand(1));

    vi.advanceTimersByTime(Math.round(1000 / defaultSimulationRules.tickRate));

    const deltaEvents = events.filter(
      (event): event is Extract<GameSessionEvent, { type: "delta" }> =>
        event.type === "delta"
    );

    expect(deltaEvents).toHaveLength(1);
    expect(deltaEvents[0]?.delta.serverTick).toBe(1);
    expect(deltaEvents[0]?.delta.updatedPlayers[0]).toMatchObject({
      playerId: "local-player",
      yaw: 90
    });
    expect(session.getLatestSnapshot()?.serverTick).toBe(1);

    session.stop();
  });

  it("stops the loopback tick and notifies subscribers exactly once", () => {
    const session = createLoopbackSession();
    const events: GameSessionEvent[] = [];

    session.subscribe((event) => {
      events.push(event);
    });

    session.stop();
    vi.advanceTimersByTime(5_000);

    const stoppedEvents = events.filter(
      (event): event is Extract<GameSessionEvent, { type: "stopped" }> =>
        event.type === "stopped"
    );

    expect(session.isStopped()).toBe(true);
    expect(stoppedEvents).toHaveLength(1);
  });
});
