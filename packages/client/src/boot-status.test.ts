import { describe, expect, it } from "vitest";

import { defaultSimulationRules } from "@gamejam/shared";

import {
  describeInitialBootStatus,
  describeJoinedStatus,
  describeProtocolErrorStatus,
  describeSnapshotStatus
} from "./boot-status.js";

describe("boot status", () => {
  it("describes room-link startup intent", () => {
    expect(
      describeInitialBootStatus({
        source: "room-link",
        request: {
          mode: "join-by-code",
          roomCode: "AB12CD"
        },
        roomCode: "AB12CD"
      })
    ).toEqual({
      badge: "Invite Link",
      title: "Joining room AB12CD",
      detail:
        "The canvas and overlay shell are mounted while the shared multiplayer session connects."
    });
  });

  it("describes joined multiplayer rooms using room visibility", () => {
    expect(
      describeJoinedStatus({
        mode: "multiplayer",
        playerId: "player-1",
        roomId: "room-1",
        roomCode: "ROOM42",
        visibility: "private",
        lateJoin: true
      })
    ).toEqual({
      badge: "Private Room",
      title: "Connected to room ROOM42",
      detail: "Joined an in-progress authoritative room."
    });
  });

  it("summarizes room snapshots with player, pickup, and timer state", () => {
    expect(
      describeSnapshotStatus({
        roomId: "room-1",
        roomCode: "ROOM42",
        mode: "single-player",
        visibility: "private",
        lateJoinAllowed: true,
        serverTick: 9,
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
              pickupId: "pickup-1",
              position: { x: 1, y: 0, z: 1 },
              kind: "score-orb"
            }
          ],
          structures: []
        },
        round: {
          phase: "active",
          roundNumber: 2,
          remainingMs: 4_100
        },
        players: [
          {
            playerId: "player-1",
            displayName: "Pilot",
            position: { x: 0, y: 1, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            yaw: 0,
            score: 2,
            connected: true
          }
        ],
        pickups: [
          {
            pickupId: "pickup-1",
            position: { x: 1, y: 0, z: 1 },
            active: true,
            respawnAtTick: null
          },
          {
            pickupId: "pickup-2",
            position: { x: -1, y: 0, z: -1 },
            active: false,
            respawnAtTick: 12
          }
        ]
      })
    ).toEqual({
      badge: "Local Snapshot",
      title: "Round 3 with 1 player(s)",
      detail: "1 active pickup(s), 5s remaining in room ROOM42."
    });
  });

  it("marks recoverable protocol errors separately", () => {
    expect(
      describeProtocolErrorStatus({
        code: "invalid-payload",
        message: "Command payload was rejected.",
        recoverable: true
      })
    ).toEqual({
      badge: "Recoverable Error",
      title: "Command payload was rejected.",
      detail:
        "The client can stay mounted while the current session flow recovers."
    });
  });
});
