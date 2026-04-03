import { describe, expect, it } from "vitest";

import { clientEventTypes, serverEventTypes } from "@gamejam/shared";

import {
  emitValidatedServerEnvelope,
  parseIncomingClientEnvelope,
  TransportBoundaryValidationError,
  validateOutgoingServerEnvelope
} from "./transport-boundary.js";

describe("transport boundary validation", () => {
  it("parses and normalizes incoming client envelopes by event type", () => {
    const envelope = parseIncomingClientEnvelope(
      clientEventTypes.roomJoinRequested,
      {
        v: 1,
        type: clientEventTypes.roomJoinRequested,
        ts: 25,
        payload: {
          roomCode: "ab-2c3d",
          displayName: "  Eddy  "
        }
      }
    );

    expect(envelope).toEqual({
      v: 1,
      type: clientEventTypes.roomJoinRequested,
      ts: 25,
      payload: {
        roomCode: "AB2C3D",
        displayName: "Eddy"
      }
    });
  });

  it("rejects malformed incoming envelopes with an invalid-payload error", () => {
    expect(() =>
      parseIncomingClientEnvelope(clientEventTypes.quickJoinRequested, {
        v: 1,
        type: clientEventTypes.roomCreationRequested,
        ts: 10,
        payload: {
          visibility: "public"
        }
      })
    ).toThrowError(TransportBoundaryValidationError);

    try {
      parseIncomingClientEnvelope(clientEventTypes.quickJoinRequested, {
        v: 1,
        type: clientEventTypes.roomCreationRequested,
        ts: 10,
        payload: {
          visibility: "public"
        }
      });
    } catch (error) {
      expect(error).toBeInstanceOf(TransportBoundaryValidationError);
      expect((error as TransportBoundaryValidationError).code).toBe(
        "invalid-payload"
      );
      expect((error as TransportBoundaryValidationError).eventType).toBe(
        clientEventTypes.quickJoinRequested
      );
    }
  });

  it("validates snapshot envelopes before emitting them", () => {
    const emitted: Array<{ event: string; envelope: unknown }> = [];
    const emitter = {
      emit(event: string, envelope: unknown) {
        emitted.push({
          event,
          envelope
        });

        return true;
      }
    };

    const envelope = emitValidatedServerEnvelope(
      emitter,
      serverEventTypes.roomSnapshotPushed,
      {
        roomId: "room-1",
        roomCode: "ab-2c3d",
        mode: "multiplayer",
        visibility: "public",
        lateJoinAllowed: true,
        serverTick: 42,
        round: {
          phase: "active",
          roundNumber: 1,
          remainingMs: 9000
        },
        players: [
          {
            playerId: "player-1",
            displayName: "Eddy",
            position: { x: 1, y: 2, z: 3 },
            velocity: { x: 0, y: 0, z: 0 },
            yaw: 90,
            score: 2,
            connected: true
          }
        ],
        pickups: [
          {
            pickupId: "pickup-1",
            position: { x: 4, y: 1, z: 0 },
            active: true,
            respawnAtTick: null
          }
        ]
      },
      1234
    );

    expect(envelope.payload.roomCode).toBe("AB2C3D");
    expect(emitted).toEqual([
      {
        event: serverEventTypes.roomSnapshotPushed,
        envelope
      }
    ]);
  });

  it("rejects invalid outgoing delta envelopes before they are emitted", () => {
    expect(() =>
      validateOutgoingServerEnvelope(serverEventTypes.roomDeltaPushed, {
        v: 1,
        type: serverEventTypes.roomDeltaPushed,
        ts: 50,
        payload: {
          roomId: "room-1",
          roomCode: "AB2C3D",
          serverTick: -1,
          updatedPlayers: [],
          removedPlayerIds: [],
          updatedPickups: [],
          removedPickupIds: []
        }
      })
    ).toThrowError(TransportBoundaryValidationError);

    try {
      validateOutgoingServerEnvelope(serverEventTypes.roomDeltaPushed, {
        v: 1,
        type: serverEventTypes.roomDeltaPushed,
        ts: 50,
        payload: {
          roomId: "room-1",
          roomCode: "AB2C3D",
          serverTick: -1,
          updatedPlayers: [],
          removedPlayerIds: [],
          updatedPickups: [],
          removedPickupIds: []
        }
      });
    } catch (error) {
      expect(error).toBeInstanceOf(TransportBoundaryValidationError);
      expect((error as TransportBoundaryValidationError).code).toBe(
        "internal-error"
      );
      expect((error as TransportBoundaryValidationError).eventType).toBe(
        serverEventTypes.roomDeltaPushed
      );
    }
  });
});
