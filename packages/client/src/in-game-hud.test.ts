import { describe, expect, it } from "vitest";

import { buildInGameHudViewModel } from "./in-game-hud.js";

const baseJoined = {
  mode: "single-player" as const,
  playerId: "p1",
  roomId: "room-1",
  roomCode: "AB12CD",
  visibility: "private" as const,
  lateJoin: false
};

const baseSnapshot = {
  roomId: "room-1",
  roomCode: "AB12CD",
  mode: "single-player" as const,
  visibility: "private" as const,
  lateJoinAllowed: true,
  serverTick: 10,
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
      {
        spawnId: "s1",
        position: { x: 0, y: 1, z: 0 },
        yaw: 0
      }
    ],
    pickupSpawns: [
      {
        pickupId: "pk1",
        position: { x: 1, y: 0.5, z: 1 },
        kind: "score-orb" as const
      }
    ],
    structures: []
  },
  round: {
    phase: "active" as const,
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
      score: 7,
      connected: true
    }
  ],
  pickups: []
};

describe("buildInGameHudViewModel", () => {
  it("shows local score from snapshot", () => {
    const vm = buildInGameHudViewModel(baseJoined, baseSnapshot);
    expect(vm.scoreLine).toBe("Score: 7");
  });

  it("shows placeholder score when snapshot is missing", () => {
    const vm = buildInGameHudViewModel(baseJoined, null);
    expect(vm.scoreLine).toBe("Score: —");
  });

  it("formats active round timer as mm:ss", () => {
    const vm = buildInGameHudViewModel(baseJoined, baseSnapshot);
    expect(vm.timerLine).toBe("Round 1 · 1:05");
  });

  it("describes waiting and resetting phases", () => {
    expect(
      buildInGameHudViewModel(baseJoined, {
        ...baseSnapshot,
        round: { phase: "waiting", roundNumber: 2, remainingMs: 0 }
      }).timerLine
    ).toBe("Round 3 · Waiting");

    expect(
      buildInGameHudViewModel(baseJoined, {
        ...baseSnapshot,
        round: { phase: "resetting", roundNumber: 1, remainingMs: 1000 }
      }).timerLine
    ).toBe("Round 2 · Resetting");
  });

  it("labels solo versus multiplayer room state", () => {
    expect(buildInGameHudViewModel(baseJoined, baseSnapshot).roomLine).toBe(
      "Solo · AB12CD"
    );

    const mpPublic = buildInGameHudViewModel(
      {
        ...baseJoined,
        mode: "multiplayer",
        visibility: "public",
        lateJoin: true
      },
      { ...baseSnapshot, mode: "multiplayer", visibility: "public" }
    );
    expect(mpPublic.roomLine).toBe("Public match · AB12CD · Mid-round join");

    const mpPrivate = buildInGameHudViewModel(
      {
        ...baseJoined,
        mode: "multiplayer",
        visibility: "private",
        lateJoin: false
      },
      { ...baseSnapshot, mode: "multiplayer", visibility: "private" }
    );
    expect(mpPrivate.roomLine).toBe("Private room · AB12CD");
  });
});
