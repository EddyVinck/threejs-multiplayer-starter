import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  defaultSimulationRules,
  type PlayerCommand,
  type RoomSnapshot
} from "@gamejam/shared";

import { createMovementRuntime } from "./movement-runtime.js";

function createMoveCommand(
  sequence: number,
  move: PlayerCommand["move"],
  look: PlayerCommand["look"] = { yaw: 0, pitch: 0 }
): PlayerCommand {
  return {
    sequence,
    deltaMs: 50,
    move,
    look,
    actions: {
      jump: false,
      primary: false,
      secondary: false
    }
  };
}

function createSnapshot(
  overrides: Partial<RoomSnapshot> = {}
): RoomSnapshot {
  const defaultSnapshot: RoomSnapshot = {
    roomId: "room-1",
    roomCode: "AB2C3D",
    mode: "single-player",
    visibility: "private",
    lateJoinAllowed: false,
    serverTick: 0,
    rules: defaultSimulationRules,
    arena: {
      bounds: {
        width: 24,
        height: 8,
        depth: 24
      },
      playerSpawns: [
        {
          spawnId: "spawn-a",
          position: { x: 0, y: 1, z: 0 },
          yaw: 0
        }
      ],
      pickupSpawns: [
        {
          pickupId: "pickup-center",
          position: { x: 2, y: 1, z: 0 },
          kind: "score-orb"
        }
      ],
      structures: []
    },
    round: {
      phase: "active",
      roundNumber: 1,
      remainingMs: 30_000
    },
    players: [
      {
        playerId: "player-1",
        displayName: "Player 1",
        position: { x: 0, y: 1, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        score: 0,
        connected: true
      }
    ],
    pickups: [
      {
        pickupId: "pickup-center",
        position: { x: 2, y: 1, z: 0 },
        active: true,
        respawnAtTick: null
      }
    ]
  };

  return {
    ...defaultSnapshot,
    ...overrides,
    round: overrides.round ?? defaultSnapshot.round,
    rules: overrides.rules ?? defaultSnapshot.rules,
    arena: overrides.arena ?? defaultSnapshot.arena,
    players: overrides.players ?? defaultSnapshot.players,
    pickups: overrides.pickups ?? defaultSnapshot.pickups
  };
}

describe("movement runtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("predicts free-flying local motion from the latest command", () => {
    const runtime = createMovementRuntime();
    runtime.syncAuthoritativeSnapshot(createSnapshot(), "player-1");
    runtime.submitPlayerCommand(createMoveCommand(1, { x: 1, y: 0, z: 0 }));

    runtime.start();
    vi.advanceTimersByTime(Math.round(1000 / defaultSimulationRules.tickRate));

    const snapshot = runtime.getSnapshot();
    expect(snapshot?.players[0]?.position.x).toBeCloseTo(0.3, 5);
    expect(snapshot?.players[0]?.velocity).toEqual({
      x: 6,
      y: 0,
      z: 0
    });

    runtime.dispose();
  });

  it("rotates local movement to match the latest camera yaw", () => {
    const runtime = createMovementRuntime();
    runtime.syncAuthoritativeSnapshot(createSnapshot(), "player-1");
    runtime.submitPlayerCommand(
      createMoveCommand(1, { x: 0, y: 0, z: -1 }, { yaw: Math.PI / 2, pitch: 0 })
    );

    runtime.start();
    vi.advanceTimersByTime(Math.round(1000 / defaultSimulationRules.tickRate));

    const snapshot = runtime.getSnapshot();
    expect(snapshot?.players[0]?.position.x).toBeCloseTo(0.3, 5);
    expect(snapshot?.players[0]?.position.z).toBeCloseTo(0, 5);
    expect(snapshot?.players[0]?.velocity.x).toBeCloseTo(6, 5);
    expect(snapshot?.players[0]?.velocity.z).toBeCloseTo(0, 5);
    expect(snapshot?.players[0]?.yaw).toBeCloseTo(Math.PI / 2, 5);

    runtime.dispose();
  });

  it("keeps the local player inside arena boundaries", () => {
    const runtime = createMovementRuntime();
    runtime.syncAuthoritativeSnapshot(
      createSnapshot({
        players: [
          {
            playerId: "player-1",
            displayName: "Player 1",
            position: { x: 11.1, y: 1, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            yaw: 0,
            score: 0,
            connected: true
          }
        ]
      }),
      "player-1"
    );
    runtime.submitPlayerCommand(createMoveCommand(1, { x: 1, y: 0, z: 0 }));

    runtime.start();
    vi.advanceTimersByTime(Math.round(1000 / defaultSimulationRules.tickRate));

    const snapshot = runtime.getSnapshot();
    expect(snapshot?.players[0]?.position.x).toBeLessThanOrEqual(11.25);

    runtime.dispose();
  });

  it("uses synced player bodies as blockers for local movement", () => {
    const runtime = createMovementRuntime();
    runtime.syncAuthoritativeSnapshot(
      createSnapshot({
        players: [
          {
            playerId: "player-1",
            displayName: "Player 1",
            position: { x: -2, y: 1, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            yaw: 0,
            score: 0,
            connected: true
          },
          {
            playerId: "player-2",
            displayName: "Player 2",
            position: { x: 0, y: 1, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            yaw: 0,
            score: 0,
            connected: true
          }
        ]
      }),
      "player-1"
    );
    runtime.submitPlayerCommand(createMoveCommand(1, { x: 1, y: 0, z: 0 }));

    runtime.start();
    vi.advanceTimersByTime(Math.round(1000 / defaultSimulationRules.tickRate) * 5);

    const snapshot = runtime.getSnapshot();
    expect(snapshot?.players[0]?.position.x).toBeLessThan(-0.7);

    runtime.dispose();
  });
});
