import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "vitest";
import { io as createSocketClient, type Socket as ClientSocket } from "socket.io-client";

import {
  clientEventTypes,
  createMessageEnvelope,
  serverEventTypes
} from "@gamejam/shared";

import { createRealtimeTransport } from "./realtime-transport.js";
import { createServerFoundation, type ServerLogger } from "./server-foundation.js";

const logger: ServerLogger = {
  info() {},
  error() {}
};

function connectClient(baseUrl: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = createSocketClient(baseUrl, {
      transports: ["websocket"]
    });

    socket.once("connect", () => {
      resolve(socket);
    });
    socket.once("connect_error", (error) => {
      socket.disconnect();
      reject(error);
    });
  });
}

function waitForEnvelope<TEnvelope>(
  socket: ClientSocket,
  eventType: string,
  timeoutMs: number = 1000
): Promise<TEnvelope> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(eventType, handleEnvelope);
      reject(new Error(`timed out waiting for ${eventType}`));
    }, timeoutMs);

    function handleEnvelope(envelope: TEnvelope): void {
      clearTimeout(timeout);
      socket.off(eventType, handleEnvelope);
      resolve(envelope);
    }

    socket.on(eventType, handleEnvelope);
  });
}

async function waitForCondition(
  condition: () => boolean,
  timeoutMs: number = 1000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error("timed out waiting for condition");
    }

    await delay(10);
  }
}

describe("realtime transport", () => {
  it("handles quick join, command submission, delta delivery, and disconnect cleanup", async () => {
    const foundation = createServerFoundation({
      host: "127.0.0.1",
      port: 0,
      tickRate: 20,
      logger
    });
    const transport = createRealtimeTransport({
      io: foundation.io,
      tickLoop: foundation.tickLoop,
      logger,
      roomRegistryOptions: {
        createRoomId: () => "room-1",
        createPlayerId: () => "player-1",
        createRoomCode: () => "ab-2c3d"
      }
    });

    let client: ClientSocket | null = null;

    try {
      const address = await foundation.start();
      client = await connectClient(`http://127.0.0.1:${address.port}`);

      const joinedPromise = waitForEnvelope<{
        payload: {
          playerId: string;
          roomId: string;
          roomCode: string;
          lateJoin: boolean;
        };
      }>(client, serverEventTypes.sessionJoined);
      const snapshotPromise = waitForEnvelope<{
        payload: {
          roomId: string;
          players: Array<{ playerId: string; displayName: string }>;
        };
      }>(client, serverEventTypes.roomSnapshotPushed);

      client.emit(
        clientEventTypes.quickJoinRequested,
        createMessageEnvelope(clientEventTypes.quickJoinRequested, {
          mode: "multiplayer",
          displayName: "Eddy"
        })
      );

      const joined = await joinedPromise;
      const snapshot = await snapshotPromise;

      expect(joined.payload).toMatchObject({
        playerId: "player-1",
        roomId: "room-1",
        roomCode: "AB2C3D",
        lateJoin: false
      });
      expect(snapshot.payload.roomId).toBe("room-1");
      expect(snapshot.payload.players).toEqual([
        expect.objectContaining({
          playerId: "player-1",
          displayName: "Eddy"
        })
      ]);
      const clientId = client.id;
      expect(clientId).toBeTruthy();
      if (!clientId) {
        throw new Error("expected connected socket id");
      }

      expect(transport.getConnectedSession(clientId)).toEqual({
        socketId: client.id,
        roomId: "room-1",
        playerId: "player-1"
      });

      const deltaPromise = waitForEnvelope<{
        payload: {
          roomId: string;
          updatedPlayers: Array<{ playerId: string }>;
          serverTick: number;
        };
      }>(client, serverEventTypes.roomDeltaPushed);

      client.emit(
        clientEventTypes.playerCommandSubmitted,
        createMessageEnvelope(clientEventTypes.playerCommandSubmitted, {
          roomId: "room-1",
          playerId: "player-1",
          command: {
            sequence: 1,
            deltaMs: 50,
            move: { x: 1, y: 0, z: 0 },
            look: { yaw: 45, pitch: 0 },
            actions: {
              jump: false,
              primary: false,
              secondary: false
            }
          }
        })
      );
      foundation.tickLoop.tickOnce();

      const delta = await deltaPromise;

      expect(delta.payload.roomId).toBe("room-1");
      expect(delta.payload.serverTick).toBeGreaterThan(0);
      expect(delta.payload.updatedPlayers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            playerId: "player-1"
          })
        ])
      );

      client.disconnect();

      await waitForCondition(() => transport.getConnectedSessionCount() === 0);
      expect(
        transport.roomRegistry.getRoomById("room-1")?.getMember("player-1")
      ).toEqual(
        expect.objectContaining({
          connected: false
        })
      );
    } finally {
      client?.disconnect();
      transport.stop();
      await foundation.stop();
    }
  });

  it("creates rooms, supports join by code, and rejects commands from sockets without a session", async () => {
    const foundation = createServerFoundation({
      host: "127.0.0.1",
      port: 0,
      tickRate: 20,
      logger
    });
    let nextPlayerId = 1;
    const transport = createRealtimeTransport({
      io: foundation.io,
      tickLoop: foundation.tickLoop,
      logger,
      roomRegistryOptions: {
        createRoomId: () => "room-1",
        createPlayerId: () => `player-${nextPlayerId++}`,
        createRoomCode: () => "AB2C3D"
      }
    });

    let hostClient: ClientSocket | null = null;
    let guestClient: ClientSocket | null = null;
    let strayClient: ClientSocket | null = null;

    try {
      const address = await foundation.start();
      const baseUrl = `http://127.0.0.1:${address.port}`;

      hostClient = await connectClient(baseUrl);

      const hostJoinedPromise = waitForEnvelope<{
        payload: { roomCode: string; lateJoin: boolean };
      }>(hostClient, serverEventTypes.sessionJoined);
      const hostSnapshotPromise = waitForEnvelope<{
        payload: { players: Array<{ playerId: string }> };
      }>(hostClient, serverEventTypes.roomSnapshotPushed);

      hostClient.emit(
        clientEventTypes.roomCreationRequested,
        createMessageEnvelope(clientEventTypes.roomCreationRequested, {
          displayName: "Host",
          visibility: "private",
          lateJoinAllowed: true
        })
      );

      const hostJoined = await hostJoinedPromise;
      const hostSnapshot = await hostSnapshotPromise;

      expect(hostJoined.payload.roomCode).toBe("AB2C3D");
      expect(hostJoined.payload.lateJoin).toBe(false);
      expect(hostSnapshot.payload.players).toHaveLength(1);

      guestClient = await connectClient(baseUrl);

      const guestJoinedPromise = waitForEnvelope<{
        payload: { roomId: string; roomCode: string; lateJoin: boolean };
      }>(guestClient, serverEventTypes.sessionJoined);
      const guestSnapshotPromise = waitForEnvelope<{
        payload: { roomId: string; players: Array<{ playerId: string }> };
      }>(guestClient, serverEventTypes.roomSnapshotPushed);

      guestClient.emit(
        clientEventTypes.roomJoinRequested,
        createMessageEnvelope(clientEventTypes.roomJoinRequested, {
          roomCode: "ab-2c3d",
          displayName: "Guest"
        })
      );

      const guestJoined = await guestJoinedPromise;
      const guestSnapshot = await guestSnapshotPromise;

      expect(guestJoined.payload).toMatchObject({
        roomId: "room-1",
        roomCode: "AB2C3D",
        lateJoin: true
      });
      expect(guestSnapshot.payload.roomId).toBe("room-1");
      expect(guestSnapshot.payload.players).toHaveLength(2);

      strayClient = await connectClient(baseUrl);

      const protocolErrorPromise = waitForEnvelope<{
        payload: { code: string; recoverable: boolean; message: string };
      }>(strayClient, serverEventTypes.protocolErrored);

      strayClient.emit(
        clientEventTypes.playerCommandSubmitted,
        createMessageEnvelope(clientEventTypes.playerCommandSubmitted, {
          roomId: "room-1",
          playerId: "player-999",
          command: {
            sequence: 1,
            deltaMs: 16,
            move: { x: 0, y: 0, z: 0 },
            look: { yaw: 0, pitch: 0 },
            actions: {
              jump: false,
              primary: false,
              secondary: false
            }
          }
        })
      );

      await expect(protocolErrorPromise).resolves.toMatchObject({
        payload: {
          code: "not-allowed",
          recoverable: true
        }
      });
    } finally {
      hostClient?.disconnect();
      guestClient?.disconnect();
      strayClient?.disconnect();
      transport.stop();
      await foundation.stop();
    }
  });

  it("hydrates late joiners with the current snapshot and continues live updates", async () => {
    const foundation = createServerFoundation({
      host: "127.0.0.1",
      port: 0,
      tickRate: 20,
      logger
    });
    let nextPlayerId = 1;
    const transport = createRealtimeTransport({
      io: foundation.io,
      tickLoop: foundation.tickLoop,
      logger,
      roomRegistryOptions: {
        createRoomId: () => "room-1",
        createPlayerId: () => `player-${nextPlayerId++}`,
        createRoomCode: () => "AB2C3D"
      }
    });

    let hostClient: ClientSocket | null = null;
    let guestClient: ClientSocket | null = null;

    try {
      const address = await foundation.start();
      foundation.tickLoop.stop();
      const baseUrl = `http://127.0.0.1:${address.port}`;

      hostClient = await connectClient(baseUrl);

      const hostJoinedPromise = waitForEnvelope<{
        payload: { playerId: string; roomId: string; roomCode: string; lateJoin: boolean };
      }>(hostClient, serverEventTypes.sessionJoined);
      const hostSnapshotPromise = waitForEnvelope<{
        payload: {
          roomId: string;
          serverTick: number;
          round: { phase: string; remainingMs: number };
        };
      }>(hostClient, serverEventTypes.roomSnapshotPushed);

      hostClient.emit(
        clientEventTypes.roomCreationRequested,
        createMessageEnvelope(clientEventTypes.roomCreationRequested, {
          displayName: "Host",
          visibility: "private",
          lateJoinAllowed: true
        })
      );

      const hostJoined = await hostJoinedPromise;
      const hostSnapshot = await hostSnapshotPromise;

      expect(hostJoined.payload).toMatchObject({
        playerId: "player-1",
        roomId: "room-1",
        roomCode: "AB2C3D",
        lateJoin: false
      });
      expect(hostSnapshot.payload).toMatchObject({
        roomId: "room-1",
        serverTick: 0,
        round: {
          phase: "active"
        }
      });

      const hostDeltaPromise = waitForEnvelope<{
        payload: {
          serverTick: number;
          updatedPlayers: Array<{
            playerId: string;
            position: { x: number; y: number; z: number };
          }>;
        };
      }>(hostClient, serverEventTypes.roomDeltaPushed);

      hostClient.emit(
        clientEventTypes.playerCommandSubmitted,
        createMessageEnvelope(clientEventTypes.playerCommandSubmitted, {
          roomId: "room-1",
          playerId: "player-1",
          command: {
            sequence: 1,
            deltaMs: 50,
            move: { x: 1, y: 0, z: 0 },
            look: { yaw: 45, pitch: 0 },
            actions: {
              jump: false,
              primary: false,
              secondary: false
            }
          }
        })
      );
      foundation.tickLoop.tickOnce();

      const hostDelta = await hostDeltaPromise;
      const hostStateAfterMovement = hostDelta.payload.updatedPlayers.find(
        (player) => player.playerId === "player-1"
      );

      expect(hostDelta.payload.serverTick).toBe(1);
      expect(hostStateAfterMovement?.position.x).toBeGreaterThan(0);

      guestClient = await connectClient(baseUrl);

      const guestJoinedPromise = waitForEnvelope<{
        payload: { playerId: string; roomId: string; roomCode: string; lateJoin: boolean };
      }>(guestClient, serverEventTypes.sessionJoined);
      const guestSnapshotPromise = waitForEnvelope<{
        payload: {
          roomId: string;
          roomCode: string;
          serverTick: number;
          round: { phase: string; remainingMs: number };
          players: Array<{
            playerId: string;
            displayName: string;
            connected: boolean;
            position: { x: number; y: number; z: number };
          }>;
        };
      }>(guestClient, serverEventTypes.roomSnapshotPushed);

      guestClient.emit(
        clientEventTypes.roomJoinRequested,
        createMessageEnvelope(clientEventTypes.roomJoinRequested, {
          roomCode: "ab-2c3d",
          displayName: "Guest"
        })
      );

      const guestJoined = await guestJoinedPromise;
      const guestSnapshot = await guestSnapshotPromise;
      const authoritativeSnapshotOnJoin =
        transport.roomRegistry.getRoomById("room-1")?.exportSnapshot() ?? null;

      expect(guestJoined.payload).toMatchObject({
        playerId: "player-2",
        roomId: "room-1",
        roomCode: "AB2C3D",
        lateJoin: true
      });
      expect(authoritativeSnapshotOnJoin).not.toBeNull();
      expect(guestSnapshot.payload).toMatchObject({
        roomId: "room-1",
        roomCode: "AB2C3D",
        serverTick: authoritativeSnapshotOnJoin?.serverTick,
        round: {
          phase: "active"
        }
      });
      expect(guestSnapshot.payload.players).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            playerId: "player-1",
            displayName: "Host",
            connected: true,
            position: hostStateAfterMovement?.position
          }),
          expect.objectContaining({
            playerId: "player-2",
            displayName: "Guest",
            connected: true
          })
        ])
      );

      const guestDeltaPromise = waitForEnvelope<{
        payload: {
          serverTick: number;
          round?: { phase: string; remainingMs: number };
          updatedPlayers: Array<{ playerId: string }>;
        };
      }>(guestClient, serverEventTypes.roomDeltaPushed);

      foundation.tickLoop.tickOnce();

      const guestDelta = await guestDeltaPromise;

      expect(guestDelta.payload.serverTick).toBeGreaterThan(
        guestSnapshot.payload.serverTick
      );
      expect(guestDelta.payload.round).toMatchObject({
        phase: "active"
      });
      expect(guestDelta.payload.round?.remainingMs).toBeLessThan(
        guestSnapshot.payload.round.remainingMs
      );
      expect(guestDelta.payload.updatedPlayers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            playerId: "player-1"
          }),
          expect.objectContaining({
            playerId: "player-2"
          })
        ])
      );
    } finally {
      hostClient?.disconnect();
      guestClient?.disconnect();
      transport.stop();
      await foundation.stop();
    }
  });
});
