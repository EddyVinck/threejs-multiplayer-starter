import { describe, expect, it } from "vitest";

import { defaultSimulationRules, type LookInput, type RoomSnapshot } from "@gamejam/shared";

import { createCameraController } from "./camera-controller.js";

function createSnapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
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
      ]
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

describe("camera controller", () => {
  it("snaps to a chase pose behind the local player on first update", () => {
    const controller = createCameraController({
      followDistance: 8,
      targetHeight: 1.5,
      initialPitch: 0,
      positionSharpness: 0,
      targetSharpness: 0
    });

    controller.syncAuthoritativeSnapshot(createSnapshot(), "player-1");

    const pose = controller.update(1 / 60);

    expect(pose).toEqual({
      position: {
        x: 0,
        y: 2.5,
        z: 8
      },
      target: {
        x: 0,
        y: 2.5,
        z: 0
      },
      yaw: 0,
      pitch: 0,
      distance: 8
    });
  });

  it("uses mouse-driven look input to orbit around the tracked player", () => {
    const controller = createCameraController({
      followDistance: 6,
      targetHeight: 1,
      positionSharpness: 0,
      targetSharpness: 0
    });

    controller.syncAuthoritativeSnapshot(createSnapshot(), "player-1");
    controller.submitLookInput(createLookInput(Math.PI / 2, -0.4));

    const pose = controller.update(1 / 60);

    expect(pose?.yaw).toBeCloseTo(Math.PI / 2, 5);
    expect(pose?.pitch).toBeCloseTo(-0.4, 5);
    expect(pose?.position.x).toBeCloseTo(-Math.cos(-0.4) * 6, 5);
    expect(pose?.position.y).toBeGreaterThan(pose?.target.y ?? 0);
    expect(pose?.position.z).toBeCloseTo(0, 5);
  });

  it("clamps pitch and smooths toward the next followed pose", () => {
    const controller = createCameraController({
      followDistance: 8,
      targetHeight: 1.5,
      minPitch: -0.5,
      maxPitch: 0.5,
      positionSharpness: 2,
      targetSharpness: 2
    });

    controller.syncAuthoritativeSnapshot(createSnapshot(), "player-1");
    const initialPose = controller.update(1 / 60);
    expect(initialPose?.target.x).toBe(0);

    controller.submitLookInput(createLookInput(0, 2));
    controller.syncAuthoritativeSnapshot(
      createSnapshot({
        players: [
          {
            playerId: "player-1",
            displayName: "Player 1",
            position: { x: 10, y: 1, z: -4 },
            velocity: { x: 0, y: 0, z: 0 },
            yaw: 0,
            score: 0,
            connected: true
          }
        ]
      }),
      "player-1"
    );

    const smoothedPose = controller.update(0.1);
    expect(smoothedPose?.pitch).toBe(0.5);
    expect(smoothedPose?.target.x).toBeGreaterThan(0);
    expect(smoothedPose?.target.x).toBeLessThan(10);
    expect(smoothedPose?.position.z).toBeLessThan(8);
  });

  it("returns null when the followed player is not in the authoritative snapshot", () => {
    const controller = createCameraController();

    controller.syncAuthoritativeSnapshot(
      createSnapshot({
        players: []
      }),
      "player-1"
    );

    expect(controller.update(1 / 60)).toBeNull();
    expect(controller.getPose()).toBeNull();
  });
});

function createLookInput(yaw: number, pitch: number): LookInput {
  return {
    yaw,
    pitch
  };
}
