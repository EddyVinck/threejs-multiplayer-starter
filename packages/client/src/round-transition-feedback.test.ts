import type { RoomSnapshot } from "@gamejam/shared";
import { describe, expect, it } from "vitest";

import {
  createRoundTransitionObservationState,
  observeRoundNumberIncrease,
  resetRoundTransitionObservation
} from "./round-transition-feedback.js";

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
    roundNumber: 1,
    remainingMs: 65_000
  },
  players: [],
  pickups: []
};

describe("round transition feedback", () => {
  it("does not signal on the first observation", () => {
    const state = createRoundTransitionObservationState();
    expect(observeRoundNumberIncrease(state, baseSnapshot)).toBe(false);
    expect(state.lastRoundNumber).toBe(1);
  });

  it("signals when round number increases", () => {
    const state = createRoundTransitionObservationState();
    observeRoundNumberIncrease(state, baseSnapshot);
    const next: RoomSnapshot = {
      ...baseSnapshot,
      serverTick: 2,
      round: { ...baseSnapshot.round, roundNumber: 2 }
    };
    expect(observeRoundNumberIncrease(state, next)).toBe(true);
  });

  it("does not signal when round number is unchanged", () => {
    const state = createRoundTransitionObservationState();
    observeRoundNumberIncrease(state, baseSnapshot);
    expect(
      observeRoundNumberIncrease(state, {
        ...baseSnapshot,
        serverTick: 2,
        round: { ...baseSnapshot.round, remainingMs: 60_000 }
      })
    ).toBe(false);
  });

  it("reset clears the baseline so the next tick is not treated as a transition", () => {
    const state = createRoundTransitionObservationState();
    observeRoundNumberIncrease(state, baseSnapshot);
    resetRoundTransitionObservation(state);
    expect(
      observeRoundNumberIncrease(state, {
        ...baseSnapshot,
        serverTick: 3,
        round: { ...baseSnapshot.round, roundNumber: 2 }
      })
    ).toBe(false);
  });
});
