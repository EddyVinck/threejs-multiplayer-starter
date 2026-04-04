import { describe, expect, it } from "vitest";

import {
  createMessageEnvelope,
  defaultSimulationRules,
  generateRoomCode,
  isValidRoomCode,
  joinRoomByCodeRequestSchema,
  authoritativeRoomStateSchema,
  roomSnapshotEnvelopeSchema,
  roomSnapshotSchema,
  serverEventTypes,
  serializeEnvelope,
  safeDeserializeEnvelope,
  safeParseJson,
  toStableJson
} from "./index.js";

describe("shared contract kit", () => {
  it("normalizes join-by-code payloads and rejects invalid room codes", () => {
    const parsed = joinRoomByCodeRequestSchema.parse({
      roomCode: "ab-2c3d",
      displayName: "  Eddy  "
    });

    expect(parsed).toEqual({
      roomCode: "AB2C3D",
      displayName: "Eddy"
    });
    expect(
      joinRoomByCodeRequestSchema.safeParse({
        roomCode: "oil10q",
        displayName: "Eddy"
      }).success
    ).toBe(false);
  });

  it("generates deterministic uppercase room codes from injected randomness", () => {
    const values = [0, 1 / 32, 2 / 32, 3 / 32, 4 / 32, 5 / 32];
    let index = 0;

    const code = generateRoomCode(() => values[index++] ?? 0);

    expect(code).toBe("ABCDEF");
    expect(isValidRoomCode(code)).toBe(true);
  });

  it("creates and validates versioned protocol envelopes", () => {
    const snapshot = roomSnapshotSchema.parse({
      roomId: "room-1",
      roomCode: "ab2c3d",
      mode: "multiplayer",
      visibility: "public",
      lateJoinAllowed: true,
      serverTick: 42,
      rules: defaultSimulationRules,
      arena: {
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
            pickupId: "pickup-1",
            position: { x: 4, y: 1, z: 2 },
            kind: "score-orb"
          }
        ]
      },
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
          score: 5,
          connected: true
        }
      ],
      pickups: [
        {
          pickupId: "pickup-1",
          position: { x: 4, y: 1, z: 2 },
          active: true,
          respawnAtTick: null
        }
      ]
    });

    const envelope = createMessageEnvelope(
      serverEventTypes.roomSnapshotPushed,
      snapshot,
      1234
    );

    expect(roomSnapshotEnvelopeSchema.parse(envelope)).toEqual({
      v: 1,
      type: serverEventTypes.roomSnapshotPushed,
      ts: 1234,
      payload: snapshot
    });
    expect(() =>
      roomSnapshotEnvelopeSchema.parse({
        ...envelope,
        v: 2
      })
    ).toThrow();
  });

  it("serializes envelopes and stable json predictably", () => {
    const envelopeJson = serializeEnvelope({
      v: 1,
      type: serverEventTypes.roomSnapshotPushed,
      ts: 50,
      payload: {
        roomId: "room-1",
        roomCode: "AB2C3D"
      }
    });

    const parsedEnvelope = safeDeserializeEnvelope(
      envelopeJson,
      roomSnapshotEnvelopeSchema.pick({
        v: true,
        type: true,
        ts: true,
        payload: true
      })
    );

    expect(parsedEnvelope.ok).toBe(false);
    expect(toStableJson({ z: 1, a: { d: 4, c: 3 }, b: [3, 2, 1] })).toBe(
      '{"a":{"c":3,"d":4},"b":[3,2,1],"z":1}'
    );
    expect(safeParseJson("{bad json}").ok).toBe(false);
  });

  it("defines authoritative simulation state with explicit round reset timing", () => {
    const state = authoritativeRoomStateSchema.parse({
      roomId: "room-1",
      roomCode: "ab2c3d",
      mode: "multiplayer",
      visibility: "public",
      lateJoinAllowed: true,
      serverTick: 120,
      rules: defaultSimulationRules,
      arena: {
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
            pickupId: "spawn-pickup-1",
            position: { x: 4, y: 1, z: 0 },
            kind: "score-orb"
          }
        ]
      },
      round: {
        phase: "resetting",
        roundNumber: 2,
        startedAtTick: 0,
        endsAtTick: 1200,
        reset: {
          reason: "round-complete",
          scheduledAtTick: 1200,
          resetAtTick: 1260
        }
      },
      players: [
        {
          playerId: "player-1",
          displayName: "Eddy",
          connected: true,
          joinedAtTick: 0,
          spawnId: "spawn-player-1",
          position: { x: 0, y: 1, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          yaw: 90,
          score: {
            total: 3,
            pickupsCollected: 3,
            lastPickupTick: 1180
          },
          lastProcessedCommandSequence: 22
        }
      ],
      pickups: [
        {
          pickupId: "spawn-pickup-1",
          kind: "score-orb",
          spawnId: "spawn-pickup-1",
          position: { x: 4, y: 1, z: 0 },
          active: false,
          scoreValue: 1,
          collectedByPlayerId: "player-1",
          collectedAtTick: 1180,
          respawnAtTick: 1220
        }
      ]
    });

    expect(state.roomCode).toBe("AB2C3D");
    expect(state.round.reset?.resetAtTick).toBe(1260);
    expect(state.players[0]?.score.pickupsCollected).toBe(3);
    expect(state.pickups[0]?.respawnAtTick).toBe(1220);
  });
});
