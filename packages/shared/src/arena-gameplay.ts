import type { PlayerId, Vector3 } from "./schemas.js";
import {
  type ArenaLayout,
  type PlayerSpawnPoint,
  type SimulationPickupState,
  type SimulationPlayerState,
  type SimulationRules
} from "./simulation.js";

export type ArenaGameplayPickupCollected = {
  playerId: PlayerId;
  pickupId: SimulationPickupState["pickupId"];
  scoreAwarded: number;
};

export type ArenaGameplayPickupRespawned = {
  pickupId: SimulationPickupState["pickupId"];
};

export type ArenaGameplayRoundResetResult = {
  updatedPlayerIds: PlayerId[];
  updatedPickupIds: SimulationPickupState["pickupId"][];
};

export type ArenaGameplayPickupCollectionResult = {
  updatedPlayerIds: PlayerId[];
  updatedPickupIds: SimulationPickupState["pickupId"][];
  collectedPickups: ArenaGameplayPickupCollected[];
};

export type ArenaGameplayPickupRespawnResult = {
  updatedPickupIds: SimulationPickupState["pickupId"][];
  respawnedPickups: ArenaGameplayPickupRespawned[];
};

export type ArenaGameplayModule = {
  createInitialPickups(): SimulationPickupState[];
  getSpawnForPlayer(playerId: PlayerId): PlayerSpawnPoint;
  resetRound(state: {
    players: SimulationPlayerState[];
    pickups: SimulationPickupState[];
  }): ArenaGameplayRoundResetResult;
  collectAvailablePickups(options: {
    players: SimulationPlayerState[];
    pickups: SimulationPickupState[];
    serverTick: number;
  }): ArenaGameplayPickupCollectionResult;
  respawnCollectedPickups(options: {
    pickups: SimulationPickupState[];
    serverTick: number;
  }): ArenaGameplayPickupRespawnResult;
};

function cloneVector3(value: Vector3): Vector3 {
  return {
    x: value.x,
    y: value.y,
    z: value.z
  };
}

function pickSpawnIndex(playerId: PlayerId, spawnCount: number): number {
  let hash = 0;
  for (const character of playerId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash % spawnCount;
}

function vectorLengthSquared(vector: Vector3): number {
  return vector.x ** 2 + vector.y ** 2 + vector.z ** 2;
}

export function createArenaGameplayModule(options: {
  arena: ArenaLayout;
  rules: SimulationRules;
}): ArenaGameplayModule {
  const pickupSpawnById = new Map(
    options.arena.pickupSpawns.map((spawnPoint) => [spawnPoint.pickupId, spawnPoint])
  );

  function getSpawnForPlayer(playerId: PlayerId): PlayerSpawnPoint {
    const spawnIndex = pickSpawnIndex(playerId, options.arena.playerSpawns.length);
    const fallbackSpawn = options.arena.playerSpawns[0];

    if (!fallbackSpawn) {
      throw new Error("arena must define at least one player spawn");
    }

    return options.arena.playerSpawns[spawnIndex] ?? fallbackSpawn;
  }

  return {
    createInitialPickups() {
      return options.arena.pickupSpawns.map((spawnPoint) => ({
        pickupId: spawnPoint.pickupId,
        kind: spawnPoint.kind,
        spawnId: spawnPoint.pickupId,
        position: cloneVector3(spawnPoint.position),
        active: true,
        scoreValue: options.rules.pickup.scoreValue,
        collectedByPlayerId: null,
        collectedAtTick: null,
        respawnAtTick: null
      }));
    },

    getSpawnForPlayer,

    resetRound(state) {
      const updatedPlayerIds = new Set<PlayerId>();
      const updatedPickupIds = new Set<SimulationPickupState["pickupId"]>();

      for (const pickup of state.pickups) {
        const spawn = pickupSpawnById.get(pickup.pickupId);
        if (!spawn) {
          continue;
        }

        pickup.position = cloneVector3(spawn.position);
        pickup.kind = spawn.kind;
        pickup.active = true;
        pickup.collectedAtTick = null;
        pickup.collectedByPlayerId = null;
        pickup.respawnAtTick = null;
        updatedPickupIds.add(pickup.pickupId);
      }

      for (const player of state.players) {
        const spawn = getSpawnForPlayer(player.playerId);
        player.spawnId = spawn.spawnId;
        player.position = cloneVector3(spawn.position);
        player.velocity = { x: 0, y: 0, z: 0 };
        player.yaw = spawn.yaw;
        player.score = {
          total: 0,
          pickupsCollected: 0,
          lastPickupTick: null
        };
        updatedPlayerIds.add(player.playerId);
      }

      return {
        updatedPlayerIds: [...updatedPlayerIds],
        updatedPickupIds: [...updatedPickupIds]
      };
    },

    collectAvailablePickups({ players, pickups, serverTick }) {
      const updatedPlayerIds = new Set<PlayerId>();
      const updatedPickupIds = new Set<SimulationPickupState["pickupId"]>();
      const collectedPickups: ArenaGameplayPickupCollected[] = [];
      const collisionDistance =
        options.rules.playerCollisionRadius + options.rules.pickup.collisionRadius;
      const collisionDistanceSquared = collisionDistance ** 2;

      for (const pickup of pickups) {
        if (!pickup.active) {
          continue;
        }

        const collector = players.find((player) => {
          if (!player.connected) {
            return false;
          }

          const offset = {
            x: player.position.x - pickup.position.x,
            y: player.position.y - pickup.position.y,
            z: player.position.z - pickup.position.z
          };

          return vectorLengthSquared(offset) <= collisionDistanceSquared;
        });

        if (!collector) {
          continue;
        }

        pickup.active = false;
        pickup.collectedByPlayerId = collector.playerId;
        pickup.collectedAtTick = serverTick;
        pickup.respawnAtTick = serverTick + options.rules.pickup.respawnTicks;
        updatedPickupIds.add(pickup.pickupId);

        collector.score.total += pickup.scoreValue;
        collector.score.pickupsCollected += 1;
        collector.score.lastPickupTick = serverTick;
        updatedPlayerIds.add(collector.playerId);

        collectedPickups.push({
          playerId: collector.playerId,
          pickupId: pickup.pickupId,
          scoreAwarded: pickup.scoreValue
        });
      }

      return {
        updatedPlayerIds: [...updatedPlayerIds],
        updatedPickupIds: [...updatedPickupIds],
        collectedPickups
      };
    },

    respawnCollectedPickups({ pickups, serverTick }) {
      const updatedPickupIds = new Set<SimulationPickupState["pickupId"]>();
      const respawnedPickups: ArenaGameplayPickupRespawned[] = [];

      for (const pickup of pickups) {
        if (
          pickup.active ||
          pickup.respawnAtTick === null ||
          serverTick < pickup.respawnAtTick
        ) {
          continue;
        }

        const spawn = pickupSpawnById.get(pickup.pickupId);
        if (!spawn) {
          continue;
        }

        pickup.position = cloneVector3(spawn.position);
        pickup.kind = spawn.kind;
        pickup.active = true;
        pickup.collectedAtTick = null;
        pickup.collectedByPlayerId = null;
        pickup.respawnAtTick = null;
        updatedPickupIds.add(pickup.pickupId);
        respawnedPickups.push({
          pickupId: pickup.pickupId
        });
      }

      return {
        updatedPickupIds: [...updatedPickupIds],
        respawnedPickups
      };
    }
  };
}
