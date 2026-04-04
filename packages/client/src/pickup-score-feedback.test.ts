import type { RoomSnapshot } from "@gamejam/shared";
import { describe, expect, it } from "vitest";

import {
  createLocalScoreObservationState,
  observeLocalScoreIncrease,
  resetLocalScoreObservation
} from "./pickup-score-feedback.js";

const baseSnapshot: RoomSnapshot = {
  roomId: "room-1",
  roomCode: "AB12CD",
  mode: "single-player",
  visibility: "private",
  lateJoinAllowed: true,
  serverTick: 1,
  rules: {
    tickRate: 20,
    maxPlayers: 8,
    playerCollisionRadius: 0.5,
    round: { durationMs: 120_000, resetDurationMs: 3000 },
    pickup: { scoreValue: 1, collisionRadius: 0.4, respawnTicks: 40 }
  },
  arena: {
    bounds: { width: 40, height: 12, depth: 40 },
    playerSpawns: [
      { spawnId: "s1", position: { x: 0, y: 1, z: 0 }, yaw: 0 }
    ],
    pickupSpawns: [
      {
        pickupId: "pk1",
        position: { x: 1, y: 0.5, z: 1 },
        kind: "score-orb"
      }
    ],
    structures: []
  },
  round: {
    phase: "active",
    roundNumber: 0,
    remainingMs: 65_000
  },
  players: [
    {
      playerId: "p1",
      displayName: "Jammer",
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      score: 0,
      connected: true
    }
  ],
  pickups: []
};

describe("pickup score feedback", () => {
  it("does not signal on the first observation", () => {
    const state = createLocalScoreObservationState();
    expect(observeLocalScoreIncrease(state, "p1", baseSnapshot)).toBe(false);
    expect(state.lastScore).toBe(0);
  });

  it("signals when local score increases", () => {
    const state = createLocalScoreObservationState();
    observeLocalScoreIncrease(state, "p1", baseSnapshot);
    const next: RoomSnapshot = {
      ...baseSnapshot,
      serverTick: 2,
      players: [{ ...baseSnapshot.players[0]!, score: 1 }]
    };
    expect(observeLocalScoreIncrease(state, "p1", next)).toBe(true);
  });

  it("does not signal when score is unchanged or decreases", () => {
    const state = createLocalScoreObservationState();
    observeLocalScoreIncrease(state, "p1", {
      ...baseSnapshot,
      players: [{ ...baseSnapshot.players[0]!, score: 3 }]
    });
    expect(
      observeLocalScoreIncrease(state, "p1", {
        ...baseSnapshot,
        serverTick: 2,
        players: [{ ...baseSnapshot.players[0]!, score: 3 }]
      })
    ).toBe(false);
    expect(
      observeLocalScoreIncrease(state, "p1", {
        ...baseSnapshot,
        serverTick: 3,
        players: [{ ...baseSnapshot.players[0]!, score: 0 }]
      })
    ).toBe(false);
  });

  it("reset clears the baseline so the next tick is not treated as a gain", () => {
    const state = createLocalScoreObservationState();
    observeLocalScoreIncrease(state, "p1", baseSnapshot);
    resetLocalScoreObservation(state);
    expect(
      observeLocalScoreIncrease(state, "p1", {
        ...baseSnapshot,
        serverTick: 2,
        players: [{ ...baseSnapshot.players[0]!, score: 1 }]
      })
    ).toBe(false);
  });
});
