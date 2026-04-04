import { describe, expect, it } from "vitest";

import {
  createArenaGameplayModule,
  defaultSimulationRules,
  type ArenaLayout,
  type SimulationPickupState,
  type SimulationPlayerState,
  type SimulationRules
} from "./index.js";

const arena: ArenaLayout = {
  bounds: {
    width: 24,
    height: 8,
    depth: 24
  },
  playerSpawns: [
    {
      spawnId: "spawn-west",
      position: { x: -4, y: 1, z: 0 },
      yaw: 0
    },
    {
      spawnId: "spawn-east",
      position: { x: 4, y: 1, z: 0 },
      yaw: Math.PI
    }
  ],
  pickupSpawns: [
    {
      pickupId: "pickup-center",
      position: { x: 0, y: 1, z: 0 },
      kind: "score-orb"
    }
  ],
  structures: []
};

function createRules(
  overrides: Partial<Omit<SimulationRules, "round" | "pickup">> & {
    round?: Partial<SimulationRules["round"]>;
    pickup?: Partial<SimulationRules["pickup"]>;
  } = {}
): SimulationRules {
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

function createPlayer(playerId: string): SimulationPlayerState {
  return {
    playerId,
    displayName: `Player ${playerId}`,
    connected: true,
    joinedAtTick: 0,
    spawnId: "spawn-west",
    position: { x: -8, y: 2, z: 3 },
    velocity: { x: 3, y: 0, z: -2 },
    yaw: 1.25,
    score: {
      total: 4,
      pickupsCollected: 4,
      lastPickupTick: 12
    },
    lastProcessedCommandSequence: 7
  };
}

function createPickup(): SimulationPickupState {
  return {
    pickupId: "pickup-center",
    kind: "score-orb",
    spawnId: "pickup-center",
    position: { x: 2, y: 1, z: 0 },
    active: false,
    scoreValue: 2,
    collectedByPlayerId: "player-1",
    collectedAtTick: 9,
    respawnAtTick: 11
  };
}

describe("arena gameplay module", () => {
  it("creates initial pickup state from arena spawn definitions", () => {
    const gameplay = createArenaGameplayModule({
      arena,
      rules: createRules({
        pickup: {
          scoreValue: 3
        }
      })
    });

    expect(gameplay.createInitialPickups()).toEqual([
      {
        pickupId: "pickup-center",
        kind: "score-orb",
        spawnId: "pickup-center",
        position: { x: 0, y: 1, z: 0 },
        active: true,
        scoreValue: 3,
        collectedByPlayerId: null,
        collectedAtTick: null,
        respawnAtTick: null
      }
    ]);
  });

  it("collects active pickups for nearby connected players and schedules respawns", () => {
    const gameplay = createArenaGameplayModule({
      arena,
      rules: createRules({
        pickup: {
          scoreValue: 2,
          respawnTicks: 5
        }
      })
    });
    const players = [createPlayer("player-1")];
    players[0]!.position = { x: 0.2, y: 1, z: 0 };
    players[0]!.score = {
      total: 0,
      pickupsCollected: 0,
      lastPickupTick: null
    };
    const pickups = gameplay.createInitialPickups();

    const result = gameplay.collectAvailablePickups({
      players,
      pickups,
      serverTick: 20
    });

    expect(result).toEqual({
      updatedPlayerIds: ["player-1"],
      updatedPickupIds: ["pickup-center"],
      collectedPickups: [
        {
          playerId: "player-1",
          pickupId: "pickup-center",
          scoreAwarded: 2
        }
      ]
    });
    expect(players[0]?.score).toEqual({
      total: 2,
      pickupsCollected: 1,
      lastPickupTick: 20
    });
    expect(pickups[0]).toMatchObject({
      active: false,
      collectedByPlayerId: "player-1",
      respawnAtTick: 25
    });
  });

  it("respawns inactive pickups at their spawn locations once ready", () => {
    const gameplay = createArenaGameplayModule({
      arena,
      rules: createRules()
    });
    const pickups = [createPickup()];

    const result = gameplay.respawnCollectedPickups({
      pickups,
      serverTick: 11
    });

    expect(result).toEqual({
      updatedPickupIds: ["pickup-center"],
      respawnedPickups: [
        {
          pickupId: "pickup-center"
        }
      ]
    });
    expect(pickups[0]).toEqual({
      pickupId: "pickup-center",
      kind: "score-orb",
      spawnId: "pickup-center",
      position: { x: 0, y: 1, z: 0 },
      active: true,
      scoreValue: 2,
      collectedByPlayerId: null,
      collectedAtTick: null,
      respawnAtTick: null
    });
  });

  it("resets player score and pickup state for a fresh round", () => {
    const gameplay = createArenaGameplayModule({
      arena,
      rules: createRules()
    });
    const players = [createPlayer("player-1"), createPlayer("player-2")];
    const pickups = [createPickup()];

    const result = gameplay.resetRound({
      players,
      pickups
    });

    expect(result.updatedPlayerIds).toEqual(["player-1", "player-2"]);
    expect(result.updatedPickupIds).toEqual(["pickup-center"]);
    expect(players[0]?.score).toEqual({
      total: 0,
      pickupsCollected: 0,
      lastPickupTick: null
    });
    expect(players[0]?.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(players[1]?.spawnId).toBe(gameplay.getSpawnForPlayer("player-2").spawnId);
    expect(pickups[0]?.active).toBe(true);
    expect(pickups[0]?.position).toEqual({ x: 0, y: 1, z: 0 });
  });
});
