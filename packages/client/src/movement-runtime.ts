import {
  playerCommandSchema,
  resolvePlayerVelocity,
  type PlayerCommand,
  type PlayerId,
  type RoomSnapshot,
  type Vector3
} from "@gamejam/shared";

import { createPhysicsAdapter, type PhysicsAdapter } from "./physics-adapter.js";
import { cloneSessionData } from "./session-snapshot.js";

const ZERO_VECTOR: Vector3 = {
  x: 0,
  y: 0,
  z: 0
};

type IntervalHandle = ReturnType<typeof globalThis.setInterval>;

export type MovementRuntime = {
  syncAuthoritativeSnapshot(snapshot: RoomSnapshot, localPlayerId: PlayerId): void;
  submitPlayerCommand(command: PlayerCommand): void;
  getSnapshot(): RoomSnapshot | null;
  start(): void;
  stop(): void;
  isRunning(): boolean;
  dispose(): void;
};

export function createMovementRuntime(): MovementRuntime {
  let localPlayerId: PlayerId | null = null;
  let currentSnapshot: RoomSnapshot | null = null;
  let latestCommand: PlayerCommand | null = null;
  let physics: PhysicsAdapter | null = null;
  let physicsConfigKey: string | null = null;
  let intervalHandle: IntervalHandle | null = null;
  let shouldRun = false;
  let syncedPlayerIds = new Set<PlayerId>();
  let syncedPickupIds = new Set<string>();

  function refreshTicker(): void {
    if (intervalHandle !== null) {
      globalThis.clearInterval(intervalHandle);
      intervalHandle = null;
    }

    if (!shouldRun || currentSnapshot === null) {
      return;
    }

    const intervalMs = Math.max(1, Math.round(1000 / currentSnapshot.rules.tickRate));
    intervalHandle = globalThis.setInterval(stepPrediction, intervalMs);
  }

  function resetPhysics(snapshot: RoomSnapshot): PhysicsAdapter {
    physics?.dispose();
    syncedPlayerIds = new Set<PlayerId>();
    syncedPickupIds = new Set<string>();
    physics = createPhysicsAdapter({
      arena: snapshot.arena,
      rules: snapshot.rules
    });
    physicsConfigKey = createPhysicsConfigKey(snapshot);
    syncPhysicsState(snapshot);
    return physics;
  }

  function ensurePhysics(snapshot: RoomSnapshot): PhysicsAdapter {
    const configKey = createPhysicsConfigKey(snapshot);
    if (physics === null || physicsConfigKey !== configKey) {
      return resetPhysics(snapshot);
    }

    return physics;
  }

  function syncPhysicsState(snapshot: RoomSnapshot): void {
    if (physics === null) {
      return;
    }

    const nextPlayerIds = new Set<PlayerId>();
    for (const player of snapshot.players) {
      physics.syncPlayer({
        playerId: player.playerId,
        position: cloneVector(player.position),
        velocity: cloneVector(player.velocity)
      });
      nextPlayerIds.add(player.playerId);
    }

    for (const playerId of syncedPlayerIds) {
      if (!nextPlayerIds.has(playerId)) {
        physics.removePlayer(playerId);
      }
    }
    syncedPlayerIds = nextPlayerIds;

    const nextPickupIds = new Set<string>();
    for (const pickup of snapshot.pickups) {
      physics.syncPickup({
        pickupId: pickup.pickupId,
        position: cloneVector(pickup.position),
        active: pickup.active
      });
      nextPickupIds.add(pickup.pickupId);
    }

    for (const pickupId of syncedPickupIds) {
      if (!nextPickupIds.has(pickupId)) {
        physics.removePickup(pickupId);
      }
    }
    syncedPickupIds = nextPickupIds;
  }

  function stepPrediction(): void {
    if (currentSnapshot === null || localPlayerId === null) {
      return;
    }

    const nextPhysics = ensurePhysics(currentSnapshot);
    const localPlayer = currentSnapshot.players.find(
      (player) => player.playerId === localPlayerId
    );
    if (!localPlayer || !localPlayer.connected) {
      return;
    }

    const nextYaw = latestCommand?.look.yaw ?? localPlayer.yaw;
    const nextVelocity =
      latestCommand === null ? ZERO_VECTOR : resolvePlayerVelocity(latestCommand.move, nextYaw);
    const desiredTranslation = scaleVector(
      nextVelocity,
      1 / currentSnapshot.rules.tickRate
    );
    const motion = nextPhysics.movePlayer(localPlayerId, desiredTranslation);

    localPlayer.position = motion.nextPosition;
    localPlayer.velocity = cloneVector(nextVelocity);
    localPlayer.yaw = nextYaw;
  }

  return {
    syncAuthoritativeSnapshot(snapshot, nextLocalPlayerId) {
      localPlayerId = nextLocalPlayerId;
      currentSnapshot = cloneSessionData(snapshot);
      ensurePhysics(currentSnapshot);
      syncPhysicsState(currentSnapshot);
      refreshTicker();
    },

    submitPlayerCommand(command) {
      latestCommand = playerCommandSchema.parse(command);
    },

    getSnapshot() {
      return currentSnapshot === null ? null : cloneSessionData(currentSnapshot);
    },

    start() {
      shouldRun = true;
      refreshTicker();
    },

    stop() {
      shouldRun = false;
      if (intervalHandle !== null) {
        globalThis.clearInterval(intervalHandle);
        intervalHandle = null;
      }
    },

    isRunning() {
      return intervalHandle !== null;
    },

    dispose() {
      shouldRun = false;
      if (intervalHandle !== null) {
        globalThis.clearInterval(intervalHandle);
        intervalHandle = null;
      }
      physics?.dispose();
      physics = null;
      physicsConfigKey = null;
      syncedPlayerIds.clear();
      syncedPickupIds.clear();
      currentSnapshot = null;
      latestCommand = null;
      localPlayerId = null;
    }
  };
}

function createPhysicsConfigKey(snapshot: RoomSnapshot): string {
  return JSON.stringify({
    roomId: snapshot.roomId,
    rules: snapshot.rules,
    arena: snapshot.arena
  });
}

function scaleVector(vector: Vector3, scale: number): Vector3 {
  return {
    x: vector.x * scale,
    y: vector.y * scale,
    z: vector.z * scale
  };
}

function cloneVector(vector: Vector3): Vector3 {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z
  };
}
