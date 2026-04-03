import { describe, expect, it } from "vitest";

import { createGlobalAuthoritativeTickLoop } from "./server-foundation.js";
import {
  createRoomRuntimeRegistry,
  RoomRuntimeError
} from "./room-runtime.js";

type RegistryFactoryOptions = {
  emptyRoomTtlTicks?: number;
};

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
    createRoomId: () => `room-${nextRoomId++}`,
    createPlayerId: () => `player-${nextPlayerId++}`,
    createRoomCode: () => roomCodes[nextRoomCode++] ?? "NP8Q9R"
  });
}

describe("room runtime", () => {
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
