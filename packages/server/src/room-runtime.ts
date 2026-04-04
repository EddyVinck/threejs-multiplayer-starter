import { randomUUID } from "node:crypto";

import {
  createRoomRequestSchema,
  displayNameSchema,
  generateRoomCode,
  joinRoomByCodeRequestSchema,
  playerIdSchema,
  quickJoinRequestSchema,
  resolveSampleModeConfig,
  roomCodeSchema,
  roomIdSchema,
  type ArenaLayout,
  type DisplayName,
  type PlayerCommand,
  type PlayerId,
  type ProtocolErrorCode,
  type RoomCode,
  type RoomDelta,
  type RoomId,
  type RoomSnapshot,
  type RoomVisibility,
  type SimulationRules
} from "@gamejam/shared";

import { createSimulationCore } from "./simulation-core.js";
import type { GlobalAuthoritativeTickLoop } from "./server-foundation.js";

const defaultSampleMode = resolveSampleModeConfig();
const DEFAULT_EMPTY_ROOM_TTL_TICKS = defaultSampleMode.rules.tickRate * 30;
const DEFAULT_ROOM_CODE_GENERATION_ATTEMPTS = 32;

export const defaultRoomArena: ArenaLayout = defaultSampleMode.arena;

export type RoomRuntimeErrorCode = Extract<
  ProtocolErrorCode,
  "room-not-found" | "room-full" | "not-allowed" | "internal-error"
>;

export class RoomRuntimeError extends Error {
  readonly code: RoomRuntimeErrorCode;

  constructor(code: RoomRuntimeErrorCode, message: string) {
    super(message);
    this.name = "RoomRuntimeError";
    this.code = code;
  }
}

export type RoomMember = {
  playerId: PlayerId;
  displayName: DisplayName;
  connected: boolean;
  joinedAtTick: number;
};

export type RoomRuntimeJoinRequest = {
  playerId?: PlayerId;
  displayName: DisplayName;
};

export type RoomRuntimeJoinResult = {
  createdRoom: boolean;
  lateJoin: boolean;
  playerId: PlayerId;
  roomId: RoomId;
  roomCode: RoomCode;
  visibility: RoomVisibility;
  snapshot: RoomSnapshot;
};

export type RoomRuntimeStepResult = {
  delta: RoomDelta | null;
  disposed: boolean;
  serverTick: number;
};

export type RoomRuntimeOptions = {
  roomId: RoomId;
  roomCode: RoomCode;
  visibility: RoomVisibility;
  lateJoinAllowed: boolean;
  arena?: ArenaLayout;
  rules?: SimulationRules;
  emptyRoomTtlTicks?: number;
};

export type RoomRuntime = {
  readonly roomId: RoomId;
  readonly roomCode: RoomCode;
  readonly visibility: RoomVisibility;
  readonly lateJoinAllowed: boolean;
  join(
    request: RoomRuntimeJoinRequest,
    options?: {
      createdRoom?: boolean;
    }
  ): RoomRuntimeJoinResult;
  leave(playerId: PlayerId): boolean;
  disconnect(playerId: PlayerId): boolean;
  submitPlayerCommand(playerId: PlayerId, command: PlayerCommand): void;
  step(): RoomRuntimeStepResult;
  exportSnapshot(): RoomSnapshot;
  getMember(playerId: PlayerId): RoomMember | null;
  listMembers(): RoomMember[];
  getConnectedMemberCount(): number;
  getMemberCount(): number;
  isAvailableForQuickJoin(): boolean;
  isDisposed(): boolean;
};

export type CreateRoomSessionRequest = {
  playerId?: PlayerId;
  displayName?: string;
  visibility?: RoomVisibility;
  lateJoinAllowed?: boolean;
};

export type QuickJoinSessionRequest = {
  playerId?: PlayerId;
  displayName?: string;
};

export type JoinRoomByCodeSessionRequest = {
  playerId?: PlayerId;
  displayName?: string;
  roomCode: string;
};

export type RoomRuntimeRegistryOptions = {
  arena?: ArenaLayout;
  rules?: SimulationRules;
  emptyRoomTtlTicks?: number;
  createRoomId?: () => RoomId;
  createPlayerId?: () => PlayerId;
  createRoomCode?: () => RoomCode;
  maxRoomCodeGenerationAttempts?: number;
  onRoomStepped?: (
    room: RoomRuntime,
    result: RoomRuntimeStepResult
  ) => void;
  tickLoop?: Pick<
    GlobalAuthoritativeTickLoop,
    "registerRoom" | "unregisterRoom"
  >;
};

export type RoomRuntimeRegistry = {
  createRoom(request: CreateRoomSessionRequest): RoomRuntimeJoinResult;
  quickJoin(request?: QuickJoinSessionRequest): RoomRuntimeJoinResult;
  joinRoomByCode(request: JoinRoomByCodeSessionRequest): RoomRuntimeJoinResult;
  leaveRoom(roomId: RoomId, playerId: PlayerId): boolean;
  disconnectPlayer(roomId: RoomId, playerId: PlayerId): boolean;
  submitPlayerCommand(
    roomId: RoomId,
    playerId: PlayerId,
    command: PlayerCommand
  ): void;
  getRoomById(roomId: RoomId): RoomRuntime | null;
  getRoomByCode(roomCode: string): RoomRuntime | null;
  listRooms(): RoomRuntime[];
};

function createDefaultRoomId(): RoomId {
  return roomIdSchema.parse(`room-${randomUUID()}`);
}

function createDefaultPlayerId(): PlayerId {
  return playerIdSchema.parse(`player-${randomUUID()}`);
}

function cloneMember(member: RoomMember): RoomMember {
  return {
    ...member
  };
}

function toRoomRuntimeError(
  code: RoomRuntimeErrorCode,
  message: string
): RoomRuntimeError {
  return new RoomRuntimeError(code, message);
}

export function createRoomRuntime(options: RoomRuntimeOptions): RoomRuntime {
  const sampleMode = resolveSampleModeConfig({
    ...(options.arena === undefined ? {} : { arena: options.arena }),
    ...(options.rules === undefined ? {} : { rules: options.rules })
  });
  const core = createSimulationCore({
    roomId: options.roomId,
    roomCode: options.roomCode,
    mode: "multiplayer",
    visibility: options.visibility,
    lateJoinAllowed: options.lateJoinAllowed,
    arena: sampleMode.arena,
    rules: sampleMode.rules
  });
  const members = new Map<PlayerId, RoomMember>();
  const emptyRoomTtlTicks =
    options.emptyRoomTtlTicks ?? DEFAULT_EMPTY_ROOM_TTL_TICKS;
  let emptySinceTick: number | null = null;
  let disposed = false;

  function ensureActive(): void {
    if (disposed) {
      throw toRoomRuntimeError("room-not-found", "room is no longer active");
    }
  }

  function getConnectedMemberCount(): number {
    let connectedCount = 0;

    for (const member of members.values()) {
      if (member.connected) {
        connectedCount += 1;
      }
    }

    return connectedCount;
  }

  function refreshIdleState(serverTick: number): void {
    if (members.size === 0) {
      disposed = true;
      return;
    }

    if (getConnectedMemberCount() > 0) {
      emptySinceTick = null;
      return;
    }

    if (emptySinceTick === null) {
      emptySinceTick = serverTick;
      return;
    }

    if (serverTick - emptySinceTick >= emptyRoomTtlTicks) {
      disposed = true;
    }
  }

  function canAcceptNewMember(playerId?: PlayerId): {
    lateJoin: boolean;
    existingMember: RoomMember | null;
  } {
    const snapshot = core.exportSnapshot();
    const existingMember =
      playerId === undefined ? null : members.get(playerId) ?? null;
    const lateJoin = snapshot.round.phase !== "waiting" && existingMember === null;

    if (lateJoin && !options.lateJoinAllowed) {
      throw toRoomRuntimeError(
        "not-allowed",
        "late join is disabled for this room"
      );
    }

    return {
      lateJoin,
      existingMember
    };
  }

  return {
    roomId: options.roomId,
    roomCode: options.roomCode,
    visibility: options.visibility,
    lateJoinAllowed: options.lateJoinAllowed,

    join(request, joinOptions = {}) {
      ensureActive();

      const { lateJoin, existingMember } = canAcceptNewMember(request.playerId);
      let playerId = existingMember?.playerId ?? request.playerId;

      if (playerId === undefined) {
        throw toRoomRuntimeError(
          "internal-error",
          "new members must be assigned a player id before joining"
        );
      }

      try {
        const player = core.upsertPlayer({
          playerId,
          displayName: request.displayName,
          connected: true
        });

        members.set(player.playerId, {
          playerId: player.playerId,
          displayName: player.displayName,
          connected: true,
          joinedAtTick: player.joinedAtTick
        });
        playerId = player.playerId;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.toLowerCase().includes("room is full")
        ) {
          throw toRoomRuntimeError("room-full", "room is full");
        }

        throw error;
      }

      emptySinceTick = null;

      return {
        createdRoom: joinOptions.createdRoom ?? false,
        lateJoin,
        playerId,
        roomId: options.roomId,
        roomCode: options.roomCode,
        visibility: options.visibility,
        snapshot: core.hydrateLateJoin(playerId)
      };
    },

    leave(playerId) {
      ensureActive();

      const removedMember = members.delete(playerId);
      const removedPlayer = core.removePlayer(playerId);

      if (!removedMember && !removedPlayer) {
        return false;
      }

      refreshIdleState(core.exportSnapshot().serverTick);
      return true;
    },

    disconnect(playerId) {
      ensureActive();

      const member = members.get(playerId);
      if (!member) {
        return false;
      }

      member.connected = false;
      core.setPlayerConnected(playerId, false);
      refreshIdleState(core.exportSnapshot().serverTick);
      return true;
    },

    submitPlayerCommand(playerId, command) {
      ensureActive();
      core.submitPlayerCommand(playerId, command);
    },

    step() {
      ensureActive();

      const stepResult = core.step();
      const delta = core.exportDelta();
      refreshIdleState(stepResult.serverTick);

      return {
        delta,
        disposed,
        serverTick: stepResult.serverTick
      };
    },

    exportSnapshot() {
      return core.exportSnapshot();
    },

    getMember(playerId) {
      const member = members.get(playerId);
      return member ? cloneMember(member) : null;
    },

    listMembers() {
      return [...members.values()].map(cloneMember);
    },

    getConnectedMemberCount,

    getMemberCount() {
      return members.size;
    },

    isAvailableForQuickJoin() {
      if (disposed || options.visibility !== "public") {
        return false;
      }

      if (getConnectedMemberCount() === 0) {
        return false;
      }

      const snapshot = core.exportSnapshot();
      const authoritativeState = core.getAuthoritativeState();

      if (
        snapshot.round.phase !== "waiting" &&
        !options.lateJoinAllowed
      ) {
        return false;
      }

      return authoritativeState.players.length < authoritativeState.rules.maxPlayers;
    },

    isDisposed() {
      return disposed;
    }
  };
}

export function createRoomRuntimeRegistry(
  options: RoomRuntimeRegistryOptions = {}
): RoomRuntimeRegistry {
  const roomsById = new Map<RoomId, RoomRuntime>();
  const roomsByCode = new Map<RoomCode, RoomRuntime>();
  const createRoomId = options.createRoomId ?? createDefaultRoomId;
  const createPlayerId = options.createPlayerId ?? createDefaultPlayerId;
  const createRoomCode = options.createRoomCode ?? generateRoomCode;
  const maxRoomCodeGenerationAttempts =
    options.maxRoomCodeGenerationAttempts ??
    DEFAULT_ROOM_CODE_GENERATION_ATTEMPTS;
  let anonymousPlayerCount = 1;

  function resolveDisplayName(displayName?: string): DisplayName {
    if (displayName !== undefined) {
      return displayNameSchema.parse(displayName);
    }

    const fallback = displayNameSchema.parse(`Player ${anonymousPlayerCount}`);
    anonymousPlayerCount += 1;
    return fallback;
  }

  function unregisterRoom(room: RoomRuntime | undefined): void {
    if (!room) {
      return;
    }

    roomsById.delete(room.roomId);
    roomsByCode.delete(room.roomCode);
    options.tickLoop?.unregisterRoom(room.roomId);
  }

  function pruneDisposedRoom(roomId: RoomId): void {
    const room = roomsById.get(roomId);
    if (!room || !room.isDisposed()) {
      return;
    }

    unregisterRoom(room);
  }

  function registerRoom(room: RoomRuntime): void {
    roomsById.set(room.roomId, room);
    roomsByCode.set(room.roomCode, room);
    options.tickLoop?.registerRoom({
      roomId: room.roomId,
      step() {
        const stepResult = room.step();
        options.onRoomStepped?.(room, stepResult);
        pruneDisposedRoom(room.roomId);
      }
    });
  }

  function createUniqueRoomCode(): RoomCode {
    for (
      let attempt = 0;
      attempt < maxRoomCodeGenerationAttempts;
      attempt += 1
    ) {
      const roomCode = roomCodeSchema.parse(createRoomCode());
      if (!roomsByCode.has(roomCode)) {
        return roomCode;
      }
    }

    throw toRoomRuntimeError(
      "internal-error",
      "unable to allocate a unique room code"
    );
  }

  function createManagedRoom(
    visibility: RoomVisibility,
    lateJoinAllowed: boolean
  ): RoomRuntime {
    const room = createRoomRuntime({
      roomId: createRoomId(),
      roomCode: createUniqueRoomCode(),
      visibility,
      lateJoinAllowed,
      ...(options.arena === undefined ? {} : { arena: options.arena }),
      ...(options.rules === undefined ? {} : { rules: options.rules }),
      ...(options.emptyRoomTtlTicks === undefined
        ? {}
        : { emptyRoomTtlTicks: options.emptyRoomTtlTicks })
    });

    registerRoom(room);
    return room;
  }

  function getRoomById(roomId: RoomId): RoomRuntime {
    const room = roomsById.get(roomId);
    if (!room) {
      throw toRoomRuntimeError("room-not-found", `unknown room: ${roomId}`);
    }

    return room;
  }

  function getBestQuickJoinRoom(): RoomRuntime | null {
    let bestRoom: RoomRuntime | null = null;

    for (const room of roomsById.values()) {
      if (!room.isAvailableForQuickJoin()) {
        continue;
      }

      if (
        bestRoom === null ||
        room.getConnectedMemberCount() > bestRoom.getConnectedMemberCount()
      ) {
        bestRoom = room;
      }
    }

    return bestRoom;
  }

  return {
    createRoom(request) {
      const parsed = createRoomRequestSchema.parse({
        displayName: request.displayName,
        visibility: request.visibility,
        lateJoinAllowed: request.lateJoinAllowed
      });
      const room = createManagedRoom(
        parsed.visibility,
        parsed.lateJoinAllowed
      );

      try {
        return room.join(
          {
            playerId: request.playerId ?? createPlayerId(),
            displayName: resolveDisplayName(parsed.displayName)
          },
          {
            createdRoom: true
          }
        );
      } catch (error) {
        unregisterRoom(room);
        throw error;
      }
    },

    quickJoin(request = {}) {
      const parsed = quickJoinRequestSchema.parse({
        mode: "multiplayer",
        displayName: request.displayName
      });
      const matchedRoom = getBestQuickJoinRoom();
      const room = matchedRoom ?? createManagedRoom("public", true);

      try {
        const joined = room.join(
          {
            playerId: request.playerId ?? createPlayerId(),
            displayName: resolveDisplayName(parsed.displayName)
          },
          {
            createdRoom: matchedRoom === null
          }
        );

        pruneDisposedRoom(room.roomId);
        return joined;
      } catch (error) {
        if (matchedRoom === null) {
          unregisterRoom(room);
        }

        throw error;
      }
    },

    joinRoomByCode(request) {
      const parsed = joinRoomByCodeRequestSchema.parse({
        roomCode: request.roomCode,
        displayName: request.displayName
      });
      const room = roomsByCode.get(parsed.roomCode);
      if (!room) {
        throw toRoomRuntimeError(
          "room-not-found",
          `unknown room code: ${parsed.roomCode}`
        );
      }

      const joined = room.join({
        playerId: request.playerId ?? createPlayerId(),
        displayName: resolveDisplayName(parsed.displayName)
      });
      pruneDisposedRoom(room.roomId);
      return joined;
    },

    leaveRoom(roomId, playerId) {
      const room = getRoomById(roomId);
      const didLeave = room.leave(playerId);
      pruneDisposedRoom(roomId);
      return didLeave;
    },

    disconnectPlayer(roomId, playerId) {
      const room = getRoomById(roomId);
      const didDisconnect = room.disconnect(playerId);
      pruneDisposedRoom(roomId);
      return didDisconnect;
    },

    submitPlayerCommand(roomId, playerId, command) {
      const room = getRoomById(roomId);
      room.submitPlayerCommand(playerId, command);
    },

    getRoomById(roomId) {
      return roomsById.get(roomId) ?? null;
    },

    getRoomByCode(roomCode) {
      const normalizedRoomCode = roomCodeSchema.safeParse(roomCode);
      if (!normalizedRoomCode.success) {
        return null;
      }

      return roomsByCode.get(normalizedRoomCode.data) ?? null;
    },

    listRooms() {
      return [...roomsById.values()];
    }
  };
}
