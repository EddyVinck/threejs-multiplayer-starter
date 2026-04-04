import {
  createSimulationCore,
  defaultSimulationRules,
  displayNameSchema,
  playerIdSchema,
  roomCodeSchema,
  roomIdSchema,
  sessionJoinedSchema,
  type ArenaLayout,
  type DisplayName,
  type PlayerCommand,
  type PlayerId,
  type RoomDelta,
  type RoomCode,
  type RoomId,
  type RoomSnapshot,
  type RoomVisibility,
  type SimulationRules
} from "@gamejam/shared";

import type {
  GameSession,
  GameSessionEvent,
  GameSessionListener,
  GameSessionSubscribeOptions
} from "./session.js";

const DEFAULT_LOOPBACK_ROOM_ID = roomIdSchema.parse("loopback-room");
const DEFAULT_LOOPBACK_ROOM_CODE = roomCodeSchema.parse("PLAYER");
const DEFAULT_LOOPBACK_PLAYER_ID = playerIdSchema.parse("local-player");
const DEFAULT_LOOPBACK_DISPLAY_NAME = displayNameSchema.parse("Player 1");
const DEFAULT_LOOPBACK_VISIBILITY: RoomVisibility = "private";

const defaultLoopbackArena: ArenaLayout = {
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
      pickupId: "pickup-center",
      position: { x: 2, y: 1, z: 0 },
      kind: "score-orb"
    },
    {
      pickupId: "pickup-west",
      position: { x: -2, y: 1, z: 0 },
      kind: "score-orb"
    }
  ]
};

export type LoopbackSessionOptions = {
  roomId?: RoomId;
  roomCode?: RoomCode;
  playerId?: PlayerId;
  displayName?: string;
  arena?: ArenaLayout;
  rules?: SimulationRules;
};

export function createLoopbackSession(
  options: LoopbackSessionOptions = {}
): GameSession {
  const rules = options.rules ?? defaultSimulationRules;
  const roomId = options.roomId ?? DEFAULT_LOOPBACK_ROOM_ID;
  const roomCode = options.roomCode ?? DEFAULT_LOOPBACK_ROOM_CODE;
  const playerId = options.playerId ?? DEFAULT_LOOPBACK_PLAYER_ID;
  const displayName = resolveDisplayName(options.displayName);
  const arena = options.arena ?? defaultLoopbackArena;
  const listeners = new Set<GameSessionListener>();
  const core = createSimulationCore({
    roomId,
    roomCode,
    mode: "single-player",
    visibility: DEFAULT_LOOPBACK_VISIBILITY,
    lateJoinAllowed: false,
    arena,
    rules
  });

  core.upsertPlayer({
    playerId,
    displayName
  });

  const joined = sessionJoinedSchema.parse({
    mode: "single-player",
    playerId,
    roomId,
    roomCode,
    visibility: DEFAULT_LOOPBACK_VISIBILITY,
    lateJoin: false
  });
  let latestSnapshot = core.hydrateLateJoin(playerId);
  let stopped = false;

  // Clear the initial dirty state because subscribers replay the join snapshot.
  core.exportDelta();

  const intervalMs = Math.round(1000 / rules.tickRate);
  const intervalId = globalThis.setInterval(() => {
    if (stopped) {
      return;
    }

    core.step();
    const delta = core.exportDelta();
    if (!delta) {
      return;
    }

    latestSnapshot = applyDelta(latestSnapshot, delta);
    emit({
      type: "delta",
      delta
    });
  }, intervalMs);

  function emit(event: GameSessionEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  return {
    getSessionJoined() {
      return clonePlainData(joined);
    },

    getLatestSnapshot() {
      return clonePlainData(latestSnapshot);
    },

    submitPlayerCommand(command: PlayerCommand) {
      if (stopped) {
        throw new Error("loopback session has already been stopped");
      }

      core.submitPlayerCommand(playerId, command);
    },

    subscribe(
      listener: GameSessionListener,
      options: GameSessionSubscribeOptions = {}
    ) {
      listeners.add(listener);

      if (options.replayCurrent !== false) {
        listener({
          type: "joined",
          joined: clonePlainData(joined)
        });
        listener({
          type: "snapshot",
          snapshot: clonePlainData(latestSnapshot)
        });

        if (stopped) {
          listener({
            type: "stopped"
          });
        }
      }

      return () => {
        listeners.delete(listener);
      };
    },

    stop() {
      if (stopped) {
        return;
      }

      stopped = true;
      globalThis.clearInterval(intervalId);
      emit({
        type: "stopped"
      });
    },

    isStopped() {
      return stopped;
    }
  };
}

function resolveDisplayName(displayName: string | undefined): DisplayName {
  if (displayName === undefined) {
    return DEFAULT_LOOPBACK_DISPLAY_NAME;
  }

  return displayNameSchema.parse(displayName);
}

function clonePlainData<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function applyDelta(snapshot: RoomSnapshot, delta: RoomDelta): RoomSnapshot {
  const playersById = new Map(
    snapshot.players.map((player) => [player.playerId, player] as const)
  );
  const pickupsById = new Map(
    snapshot.pickups.map((pickup) => [pickup.pickupId, pickup] as const)
  );

  for (const playerId of delta.removedPlayerIds) {
    playersById.delete(playerId);
  }

  for (const player of delta.updatedPlayers) {
    playersById.set(player.playerId, player);
  }

  for (const pickupId of delta.removedPickupIds) {
    pickupsById.delete(pickupId);
  }

  for (const pickup of delta.updatedPickups) {
    pickupsById.set(pickup.pickupId, pickup);
  }

  return {
    roomId: snapshot.roomId,
    roomCode: snapshot.roomCode,
    mode: snapshot.mode,
    visibility: snapshot.visibility,
    lateJoinAllowed: snapshot.lateJoinAllowed,
    serverTick: delta.serverTick,
    round: delta.round ?? snapshot.round,
    players: [...playersById.values()],
    pickups: [...pickupsById.values()]
  };
}
