import { describe, expect, it } from "vitest";

import {
  clientEventTypes,
  createMessageEnvelope,
  defaultSimulationRules,
  serverEventTypes,
  type PlayerCommand,
  type RoomSnapshot
} from "@gamejam/shared";

import { startRemoteSession } from "./remote-session.js";
import type { GameSessionEvent } from "./session.js";

type SocketListener = (payload?: unknown) => void;

class FakeSocket {
  readonly emitted: Array<{
    eventType: string;
    payload: unknown;
  }> = [];

  disconnected = false;

  private listeners = new Map<string, Set<SocketListener>>();

  on(eventType: string, listener: SocketListener): this {
    const listeners = this.listeners.get(eventType) ?? new Set<SocketListener>();
    listeners.add(listener);
    this.listeners.set(eventType, listeners);
    return this;
  }

  once(eventType: string, listener: SocketListener): this {
    const wrappedListener: SocketListener = (payload) => {
      this.off(eventType, wrappedListener);
      listener(payload);
    };

    return this.on(eventType, wrappedListener);
  }

  off(eventType: string, listener: SocketListener): this {
    const listeners = this.listeners.get(eventType);
    listeners?.delete(listener);
    if (listeners?.size === 0) {
      this.listeners.delete(eventType);
    }
    return this;
  }

  emit(eventType: string, payload: unknown): boolean {
    this.emitted.push({
      eventType,
      payload
    });
    return true;
  }

  connect(): this {
    queueMicrotask(() => {
      this.dispatch("connect");
    });
    return this;
  }

  disconnect(): this {
    if (this.disconnected) {
      return this;
    }

    this.disconnected = true;
    this.dispatch("disconnect");
    return this;
  }

  dispatch(eventType: string, payload?: unknown): void {
    const listeners = [...(this.listeners.get(eventType) ?? [])];
    for (const listener of listeners) {
      listener(payload);
    }
  }
}

function createPlayerCommand(sequence: number): PlayerCommand {
  return {
    sequence,
    deltaMs: 50,
    move: { x: 1, y: 0, z: 0 },
    look: { yaw: 90, pitch: 0 },
    actions: {
      jump: false,
      primary: false,
      secondary: false
    }
  };
}

function createSnapshot(): RoomSnapshot {
  return {
    roomId: "room-1",
    roomCode: "AB2C3D",
    mode: "multiplayer",
    visibility: "public",
    lateJoinAllowed: true,
    serverTick: 0,
    rules: defaultSimulationRules,
    arena: {
      bounds: {
        width: 24,
        height: 8,
        depth: 24
      },
      playerSpawns: [
        {
          spawnId: "spawn-a",
          position: { x: 0, y: 1, z: 0 },
          yaw: 0
        }
      ],
      pickupSpawns: [
        {
          pickupId: "pickup-center",
          position: { x: 2, y: 1, z: 0 },
          kind: "score-orb"
        }
      ]
    },
    round: {
      phase: "active",
      roundNumber: 1,
      remainingMs: 30_000
    },
    players: [
      {
        playerId: "player-1",
        displayName: "Eddy",
        position: { x: 0, y: 1, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        score: 0,
        connected: true
      }
    ],
    pickups: [
      {
        pickupId: "pickup-center",
        position: { x: 2, y: 1, z: 0 },
        active: true,
        respawnAtTick: null
      }
    ]
  };
}

describe("remote session", () => {
  it("starts from a quick join request, replays joined state, and submits commands", async () => {
    const fakeSocket = new FakeSocket();
    const startPromise = startRemoteSession({
      mode: "quick-join",
      displayName: "Eddy",
      socketFactory: () => fakeSocket
    });

    await Promise.resolve();

    expect(fakeSocket.emitted[0]).toMatchObject({
      eventType: clientEventTypes.quickJoinRequested,
      payload: {
        payload: {
          mode: "multiplayer",
          displayName: "Eddy"
        }
      }
    });

    const snapshot = createSnapshot();
    fakeSocket.dispatch(
      serverEventTypes.sessionJoined,
      createMessageEnvelope(serverEventTypes.sessionJoined, {
        mode: "multiplayer",
        playerId: "player-1",
        roomId: "room-1",
        roomCode: "AB2C3D",
        visibility: "public",
        lateJoin: false
      })
    );
    fakeSocket.dispatch(
      serverEventTypes.roomSnapshotPushed,
      createMessageEnvelope(serverEventTypes.roomSnapshotPushed, snapshot)
    );

    const session = await startPromise;
    const events: GameSessionEvent[] = [];

    session.subscribe((event) => {
      events.push(event);
    });

    expect(events).toEqual([
      expect.objectContaining({
        type: "joined",
        joined: expect.objectContaining({
          playerId: "player-1",
          roomCode: "AB2C3D"
        })
      }),
      expect.objectContaining({
        type: "snapshot",
        snapshot: expect.objectContaining({
          roomId: "room-1",
          serverTick: 0
        })
      })
    ]);

    session.submitPlayerCommand(createPlayerCommand(1));

    expect(fakeSocket.emitted[1]).toMatchObject({
      eventType: clientEventTypes.playerCommandSubmitted,
      payload: {
        payload: {
          roomId: "room-1",
          playerId: "player-1",
          command: {
            sequence: 1
          }
        }
      }
    });

    fakeSocket.dispatch(
      serverEventTypes.roomDeltaPushed,
      createMessageEnvelope(serverEventTypes.roomDeltaPushed, {
        roomId: "room-1",
        roomCode: "AB2C3D",
        serverTick: 1,
        round: {
          phase: "active",
          roundNumber: 1,
          remainingMs: 29_950
        },
        updatedPlayers: [
          {
            ...snapshot.players[0],
            position: { x: 1, y: 1, z: 0 },
            yaw: 90
          }
        ],
        removedPlayerIds: [],
        updatedPickups: [],
        removedPickupIds: []
      })
    );

    expect(session.getLatestSnapshot()).toMatchObject({
      serverTick: 1,
      players: [
        expect.objectContaining({
          playerId: "player-1",
          yaw: 90
        })
      ]
    });

    session.stop();

    expect(session.isStopped()).toBe(true);
    expect(events.at(-1)).toEqual({
      type: "stopped"
    });
  });

  it("normalizes join-by-code requests and rejects startup protocol errors", async () => {
    const fakeSocket = new FakeSocket();
    const startPromise = startRemoteSession({
      mode: "join-by-code",
      roomCode: "ab-2c3d",
      socketFactory: () => fakeSocket
    });

    await Promise.resolve();

    expect(fakeSocket.emitted[0]).toMatchObject({
      eventType: clientEventTypes.roomJoinRequested,
      payload: {
        payload: {
          roomCode: "AB2C3D"
        }
      }
    });

    fakeSocket.dispatch(
      serverEventTypes.protocolErrored,
      createMessageEnvelope(serverEventTypes.protocolErrored, {
        code: "room-not-found",
        message: "room not found",
        recoverable: true
      })
    );

    await expect(startPromise).rejects.toThrow("room not found");
    expect(fakeSocket.disconnected).toBe(true);
  });
});
