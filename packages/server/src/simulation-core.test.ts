import { describe, expect, it } from "vitest";

import {
  defaultSimulationRules,
  type ArenaLayout,
  type SimulationRules
} from "@gamejam/shared";

import { createSimulationCore } from "./simulation-core.js";

const arena: ArenaLayout = {
  bounds: {
    width: 24,
    height: 8,
    depth: 24
  },
  playerSpawns: [
    {
      spawnId: "spawn-player-1",
      position: { x: 0, y: 1, z: 0 },
      yaw: 0
    },
    {
      spawnId: "spawn-player-2",
      position: { x: 6, y: 1, z: 0 },
      yaw: 180
    }
  ],
  pickupSpawns: [
    {
      pickupId: "pickup-1",
      position: { x: 1, y: 1, z: 0 },
      kind: "score-orb"
    }
  ],
  structures: []
};

const soloArena: ArenaLayout = {
  bounds: {
    width: 24,
    height: 8,
    depth: 24
  },
  playerSpawns: [
    {
      spawnId: "spawn-player-1",
      position: { x: 0, y: 1, z: 0 },
      yaw: 0
    }
  ],
  pickupSpawns: [
    {
      pickupId: "pickup-1",
      position: { x: 0.5, y: 1, z: 0 },
      kind: "score-orb"
    }
  ],
  structures: []
};

const structuredArena: ArenaLayout = {
  bounds: {
    width: 24,
    height: 8,
    depth: 24
  },
  playerSpawns: [
    {
      spawnId: "spawn-player-1",
      position: { x: -4, y: 1, z: 0 },
      yaw: 0
    }
  ],
  pickupSpawns: [
    {
      pickupId: "pickup-1",
      position: { x: 6, y: 1, z: 0 },
      kind: "score-orb"
    }
  ],
  structures: [
    {
      structureId: "center-block",
      position: { x: 0, y: 1, z: 0 },
      size: {
        width: 2,
        height: 2,
        depth: 2
      }
    }
  ]
};

const structureEdgeArena: ArenaLayout = {
  bounds: {
    width: 24,
    height: 8,
    depth: 24
  },
  playerSpawns: [
    {
      spawnId: "spawn-player-1",
      position: { x: -1.75, y: 1, z: -2.2 },
      yaw: 0
    }
  ],
  pickupSpawns: [
    {
      pickupId: "pickup-1",
      position: { x: 6, y: 1, z: 0 },
      kind: "score-orb"
    }
  ],
  structures: [
    {
      structureId: "center-block",
      position: { x: 0, y: 1, z: 0 },
      size: {
        width: 2,
        height: 2,
        depth: 2
      }
    }
  ]
};

function createRules(overrides: Partial<SimulationRules> = {}): SimulationRules {
  return {
    ...defaultSimulationRules,
    ...overrides,
    round: {
      ...defaultSimulationRules.round,
      ...overrides.round
    },
    pickup: {
      ...defaultSimulationRules.pickup,
      ...overrides.pickup
    }
  };
}

describe("simulation core", () => {
  it("starts rounds on first join and emits deltas for new members", () => {
    const core = createSimulationCore({
      roomId: "room-1",
      roomCode: "AB2C3D",
      mode: "multiplayer",
      visibility: "public",
      lateJoinAllowed: true,
      arena: soloArena
    });

    core.upsertPlayer({
      playerId: "player-1",
      displayName: "Eddy"
    });

    const delta = core.exportDelta();

    expect(delta).not.toBeNull();
    expect(delta?.round).toEqual({
      phase: "active",
      roundNumber: 1,
      remainingMs: defaultSimulationRules.round.durationMs
    });
    expect(delta?.updatedPlayers).toHaveLength(1);
    expect(core.exportDelta()).toBeNull();
  });

  it("advances players, awards pickup score, and hydrates late joiners from a fresh snapshot", () => {
    const core = createSimulationCore({
      roomId: "room-1",
      roomCode: "AB2C3D",
      mode: "multiplayer",
      visibility: "public",
      lateJoinAllowed: true,
      arena: soloArena
    });

    core.upsertPlayer({
      playerId: "player-1",
      displayName: "Eddy"
    });
    core.exportDelta();

    core.submitPlayerCommand("player-1", {
      sequence: 1,
      deltaMs: 50,
      move: { x: 1, y: 0, z: 0 },
      look: { yaw: 0, pitch: 0 },
      actions: {
        jump: false,
        primary: false,
        secondary: false
      }
    });

    const step = core.step();
    const delta = core.exportDelta();
    const playerDelta = delta?.updatedPlayers.find(
      (player) => player.playerId === "player-1"
    );

    expect(step.stateChanged).toBe(true);
    expect(playerDelta?.score).toBe(1);
    expect(delta?.updatedPickups[0]).toMatchObject({
      pickupId: "pickup-1",
      active: false
    });

    core.upsertPlayer({
      playerId: "player-2",
      displayName: "Sam"
    });

    const lateJoinSnapshot = core.hydrateLateJoin("player-2");

    expect(lateJoinSnapshot.players).toHaveLength(2);
    expect(lateJoinSnapshot.players.find((player) => player.playerId === "player-1")?.score).toBe(1);
    expect(lateJoinSnapshot.pickups[0]?.active).toBe(false);
  });

  it("moves forward relative to the submitted look yaw", () => {
    const core = createSimulationCore({
      roomId: "room-1",
      roomCode: "AB2C3D",
      mode: "multiplayer",
      visibility: "public",
      lateJoinAllowed: true,
      arena: structuredArena
    });

    core.upsertPlayer({
      playerId: "player-1",
      displayName: "Eddy"
    });
    core.exportDelta();

    core.submitPlayerCommand("player-1", {
      sequence: 1,
      deltaMs: 50,
      move: { x: 0, y: 0, z: -1 },
      look: { yaw: Math.PI / 2, pitch: 0 },
      actions: {
        jump: false,
        primary: false,
        secondary: false
      }
    });

    core.step();

    const player = core.exportSnapshot().players[0];
    expect(player).toBeDefined();
    expect(player?.position.x).toBeGreaterThan(-4);
    expect(player?.position.z).toBeCloseTo(0, 5);
    expect(player?.yaw).toBeCloseTo(Math.PI / 2, 5);
  });

  it("schedules and completes round resets with clean player and pickup state", () => {
    const core = createSimulationCore({
      roomId: "room-1",
      roomCode: "AB2C3D",
      mode: "multiplayer",
      visibility: "public",
      lateJoinAllowed: true,
      arena,
      rules: createRules({
        tickRate: 10,
        round: {
          durationMs: 300,
          resetDurationMs: 200
        }
      })
    });

    core.upsertPlayer({
      playerId: "player-1",
      displayName: "Eddy"
    });
    core.exportDelta();

    core.submitPlayerCommand("player-1", {
      sequence: 1,
      deltaMs: 100,
      move: { x: 1, y: 0, z: 0 },
      look: { yaw: 0, pitch: 0 },
      actions: {
        jump: false,
        primary: false,
        secondary: false
      }
    });

    core.step();
    core.exportDelta();
    core.step();
    core.exportDelta();
    core.step();

    const resettingState = core.getAuthoritativeState();

    expect(resettingState.round.phase).toBe("resetting");
    expect(resettingState.round.reset?.resetAtTick).toBe(5);

    core.exportDelta();
    core.step();
    core.exportDelta();
    core.step();

    const resetState = core.getAuthoritativeState();
    const snapshot = core.exportSnapshot();

    expect(resetState.round.phase).toBe("active");
    expect(resetState.round.roundNumber).toBe(2);
    expect(resetState.players[0]?.score.total).toBe(0);
    expect(resetState.pickups[0]?.active).toBe(true);
    expect(snapshot.round.remainingMs).toBe(300);
  });

  it("produces deterministic snapshots for identical command sequences", () => {
    const createCore = () =>
      createSimulationCore({
        roomId: "room-1",
        roomCode: "AB2C3D",
        mode: "multiplayer",
        visibility: "public",
        lateJoinAllowed: true,
        arena: soloArena,
        rules: createRules({
          tickRate: 20
        })
      });
    const left = createCore();
    const right = createCore();

    left.upsertPlayer({
      playerId: "player-1",
      displayName: "Eddy"
    });
    right.upsertPlayer({
      playerId: "player-1",
      displayName: "Eddy"
    });
    left.exportDelta();
    right.exportDelta();

    for (let sequence = 1; sequence <= 4; sequence += 1) {
      const command = {
        sequence,
        deltaMs: 50,
        move: { x: 1, y: 0, z: 0 },
        look: { yaw: sequence * 15, pitch: 0 },
        actions: {
          jump: false,
          primary: false,
          secondary: false
        }
      };

      left.submitPlayerCommand("player-1", command);
      right.submitPlayerCommand("player-1", command);
      left.step();
      right.step();
      left.exportDelta();
      right.exportDelta();
    }

    expect(left.exportSnapshot()).toEqual(right.exportSnapshot());
    expect(left.getAuthoritativeState()).toEqual(right.getAuthoritativeState());
  });

  it("prevents authoritative movement from passing through arena structures", () => {
    const core = createSimulationCore({
      roomId: "room-1",
      roomCode: "AB2C3D",
      mode: "multiplayer",
      visibility: "public",
      lateJoinAllowed: true,
      arena: structuredArena
    });

    core.upsertPlayer({
      playerId: "player-1",
      displayName: "Eddy"
    });
    core.exportDelta();

    core.submitPlayerCommand("player-1", {
      sequence: 1,
      deltaMs: 50,
      move: { x: 1, y: 0, z: 0 },
      look: { yaw: 0, pitch: 0 },
      actions: {
        jump: false,
        primary: false,
        secondary: false
      }
    });

    for (let step = 0; step < 20; step += 1) {
      core.step();
      core.exportDelta();
    }

    const player = core.exportSnapshot().players[0];
    expect(player).toBeDefined();
    expect(player?.position.x).toBeLessThanOrEqual(-1.75);
  });

  it("allows authoritative movement to slide along structure edges", () => {
    const core = createSimulationCore({
      roomId: "room-1",
      roomCode: "AB2C3D",
      mode: "multiplayer",
      visibility: "public",
      lateJoinAllowed: true,
      arena: structureEdgeArena
    });

    core.upsertPlayer({
      playerId: "player-1",
      displayName: "Eddy"
    });
    core.exportDelta();

    core.submitPlayerCommand("player-1", {
      sequence: 1,
      deltaMs: 50,
      move: { x: 0, y: 0, z: 1 },
      look: { yaw: 0, pitch: 0 },
      actions: {
        jump: false,
        primary: false,
        secondary: false
      }
    });

    core.step();

    const player = core.exportSnapshot().players[0];
    expect(player).toBeDefined();
    expect(player?.position.x).toBeCloseTo(-1.75, 5);
    expect(player?.position.z).toBeGreaterThan(-2.2);
  });
});
