import { describe, expect, it } from "vitest";

import {
  defaultSampleModeConfig,
  defaultSimulationRules,
  type SimulationRules
} from "@gamejam/shared";

import { createGlobalAuthoritativeTickLoop } from "./server-foundation.js";
import {
  createRoomRuntimeRegistry,
  RoomRuntimeError
} from "./room-runtime.js";

type RegistryFactoryOptions = {
  emptyRoomTtlTicks?: number;
  rules?: SimulationRules;
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

function createDeterministicRegistry(
  options: RegistryFactoryOptions = {}
) {
  let nextRoomId = 1;
  let nextPlayerId = 1;
  const roomCodes = ["AB2C3D", "EF4G5H", "JK6L7M"];
  let nextRoomCode = 0;

  return createRoomRuntimeRegistry({
    ...(options.emptyRoomTtlTicks === undefined
      ? {}
      : { emptyRoomTtlTicks: options.emptyRoomTtlTicks }),
    ...(options.rules === undefined ? {} : { rules: options.rules }),
    createRoomId: () => `room-${nextRoomId++}`,
    createPlayerId: () => `player-${nextPlayerId++}`,
    createRoomCode: () => roomCodes[nextRoomCode++] ?? "NP8Q9R"
  });
}

describe("room runtime", () => {
  it("creates private rooms by default and exposes them through registry lookups", () => {
    const registry = createDeterministicRegistry();

    const created = registry.createRoom({});
    const room = registry.getRoomById(created.roomId);

    expect(created.createdRoom).toBe(true);
    expect(created.lateJoin).toBe(false);
    expect(created.visibility).toBe("private");
    expect(created.snapshot.round).toEqual({
      phase: "active",
      roundNumber: 1,
      remainingMs: defaultSimulationRules.round.durationMs
    });
    expect(created.snapshot.arena).toEqual(defaultSampleModeConfig.arena);
    expect(created.snapshot.rules).toEqual(defaultSampleModeConfig.rules);
    expect(created.snapshot.players).toEqual([
      expect.objectContaining({
        playerId: created.playerId,
        displayName: "Player 1",
        connected: true
      })
    ]);
    expect(room?.listMembers()).toEqual([
      expect.objectContaining({
        playerId: created.playerId,
        displayName: "Player 1",
        connected: true,
        joinedAtTick: 0
      })
    ]);
    expect(registry.getRoomByCode("ab-2c3d")?.roomId).toBe(created.roomId);
  });

  it("quick joins into an existing public room before creating another one", () => {
    const registry = createDeterministicRegistry();

    const firstJoin = registry.quickJoin({
      displayName: "Eddy"
    });
    const secondJoin = registry.quickJoin({
      displayName: "Sam"
    });

    expect(firstJoin.createdRoom).toBe(true);
    expect(secondJoin.createdRoom).toBe(false);
    expect(secondJoin.roomId).toBe(firstJoin.roomId);
    expect(registry.listRooms()).toHaveLength(1);
    expect(registry.getRoomById(firstJoin.roomId)?.getMemberCount()).toBe(2);
  });

  it("prefers the most populated eligible public room for quick join", () => {
    const registry = createDeterministicRegistry();

    const crowded = registry.quickJoin({
      displayName: "Crowded Host"
    });
    registry.quickJoin({
      displayName: "Crowded Guest"
    });

    const sparsePublic = registry.createRoom({
      displayName: "Sparse Host",
      visibility: "public"
    });
    const privateRoom = registry.createRoom({
      displayName: "Private Host"
    });

    const joined = registry.quickJoin({
      displayName: "Matcher"
    });

    expect(joined.createdRoom).toBe(false);
    expect(joined.roomId).toBe(crowded.roomId);
    expect(joined.roomId).not.toBe(sparsePublic.roomId);
    expect(joined.roomId).not.toBe(privateRoom.roomId);
    expect(registry.getRoomById(crowded.roomId)?.getConnectedMemberCount()).toBe(3);
  });

  it("joins a room by normalized code and marks in-progress joins as late joins", () => {
    const registry = createDeterministicRegistry();
    const created = registry.createRoom({
      displayName: "Host"
    });

    const joined = registry.joinRoomByCode({
      roomCode: "ab-2c3d",
      displayName: "Guest"
    });

    expect(joined.roomId).toBe(created.roomId);
    expect(joined.roomCode).toBe(created.roomCode);
    expect(joined.lateJoin).toBe(true);
    expect(joined.snapshot.players).toHaveLength(2);
  });

  it("rejects late join attempts when a room disables join-in-progress", () => {
    const registry = createDeterministicRegistry();
    const created = registry.createRoom({
      displayName: "Host",
      lateJoinAllowed: false
    });

    expect(() =>
      registry.joinRoomByCode({
        roomCode: created.roomCode,
        displayName: "Guest"
      })
    ).toThrowError(RoomRuntimeError);

    try {
      registry.joinRoomByCode({
        roomCode: created.roomCode,
        displayName: "Guest"
      });
    } catch (error) {
      expect(error).toBeInstanceOf(RoomRuntimeError);
      expect((error as RoomRuntimeError).code).toBe("not-allowed");
    }
  });

  it("surfaces round lifecycle transitions through room runtime snapshots and deltas", () => {
    const registry = createDeterministicRegistry({
      rules: createRules({
        tickRate: 10,
        round: {
          durationMs: 300,
          resetDurationMs: 200
        }
      })
    });
    const created = registry.createRoom({
      displayName: "Host",
      visibility: "public"
    });
    const room = registry.getRoomById(created.roomId);

    expect(room).not.toBeNull();
    expect(created.snapshot.round).toEqual({
      phase: "active",
      roundNumber: 1,
      remainingMs: 300
    });

    const firstTick = room?.step();
    room?.step();
    const resetScheduled = room?.step();
    room?.step();
    const nextRound = room?.step();

    expect(firstTick?.delta?.round).toEqual({
      phase: "active",
      roundNumber: 1,
      remainingMs: 200
    });
    expect(resetScheduled?.delta?.round).toEqual({
      phase: "resetting",
      roundNumber: 1,
      remainingMs: 200
    });
    expect(nextRound?.delta?.round).toEqual({
      phase: "active",
      roundNumber: 2,
      remainingMs: 300
    });
    expect(room?.exportSnapshot().round).toEqual({
      phase: "active",
      roundNumber: 2,
      remainingMs: 300
    });
  });

  it("cleans up empty rooms on leave and after disconnected idle expiry", () => {
    const tickLoop = createGlobalAuthoritativeTickLoop({
      tickRate: 20,
      logger: {
        info() {},
        error() {}
      }
    });
    let nextRoomId = 1;
    let nextPlayerId = 1;
    const registry = createRoomRuntimeRegistry({
      emptyRoomTtlTicks: 2,
      tickLoop,
      createRoomId: () => `room-${nextRoomId++}`,
      createPlayerId: () => `player-${nextPlayerId++}`,
      createRoomCode: () => "AB2C3D"
    });

    const immediate = registry.createRoom({
      displayName: "Solo"
    });
    expect(registry.leaveRoom(immediate.roomId, immediate.playerId)).toBe(true);
    expect(registry.getRoomById(immediate.roomId)).toBeNull();

    const lingering = registry.createRoom({
      displayName: "Reconnectable"
    });
    expect(
      registry.disconnectPlayer(lingering.roomId, lingering.playerId)
    ).toBe(true);
    expect(registry.getRoomById(lingering.roomId)).not.toBeNull();

    tickLoop.tickOnce();
    expect(registry.getRoomById(lingering.roomId)).not.toBeNull();

    tickLoop.tickOnce();
    tickLoop.tickOnce();
    expect(registry.getRoomById(lingering.roomId)).toBeNull();
  });
});
