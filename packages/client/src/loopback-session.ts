import {
  createSimulationCore,
  displayNameSchema,
  playerIdSchema,
  resolveSampleModeConfig,
  roomCodeSchema,
  roomIdSchema,
  sessionJoinedSchema,
  type ArenaLayout,
  type DisplayName,
  type PlayerCommand,
  type PlayerId,
  type RoomCode,
  type RoomId,
  type RoomVisibility,
  type SimulationRules
} from "@gamejam/shared";

import type {
  GameSession,
  GameSessionEvent,
  GameSessionListener,
  GameSessionSubscribeOptions
} from "./session.js";
import { applyRoomDelta, cloneSessionData } from "./session-snapshot.js";

const DEFAULT_LOOPBACK_ROOM_ID = roomIdSchema.parse("loopback-room");
const DEFAULT_LOOPBACK_ROOM_CODE = roomCodeSchema.parse("PLAYER");
const DEFAULT_LOOPBACK_PLAYER_ID = playerIdSchema.parse("local-player");
const DEFAULT_LOOPBACK_DISPLAY_NAME = displayNameSchema.parse("Player 1");
const DEFAULT_LOOPBACK_VISIBILITY: RoomVisibility = "private";

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
  const sampleMode = resolveSampleModeConfig({
    ...(options.arena === undefined ? {} : { arena: options.arena }),
    ...(options.rules === undefined ? {} : { rules: options.rules })
  });
  const roomId = options.roomId ?? DEFAULT_LOOPBACK_ROOM_ID;
  const roomCode = options.roomCode ?? DEFAULT_LOOPBACK_ROOM_CODE;
  const playerId = options.playerId ?? DEFAULT_LOOPBACK_PLAYER_ID;
  const displayName = resolveDisplayName(options.displayName);
  const listeners = new Set<GameSessionListener>();
  const core = createSimulationCore({
    roomId,
    roomCode,
    mode: "single-player",
    visibility: DEFAULT_LOOPBACK_VISIBILITY,
    lateJoinAllowed: false,
    arena: sampleMode.arena,
    rules: sampleMode.rules
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

  const intervalMs = Math.round(1000 / sampleMode.rules.tickRate);
  const intervalId = globalThis.setInterval(() => {
    if (stopped) {
      return;
    }

    core.step();
    const delta = core.exportDelta();
    if (!delta) {
      return;
    }

    latestSnapshot = applyRoomDelta(latestSnapshot, delta);
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
      return cloneSessionData(joined);
    },

    getLatestSnapshot() {
      return cloneSessionData(latestSnapshot);
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
          joined: cloneSessionData(joined)
        });
        listener({
          type: "snapshot",
          snapshot: cloneSessionData(latestSnapshot)
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

