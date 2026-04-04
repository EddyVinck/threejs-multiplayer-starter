import { afterEach, describe, expect, it } from "vitest";

import { defaultSimulationRules, type ArenaLayout } from "@gamejam/shared";

import { createPhysicsAdapter, type PhysicsAdapter } from "./physics-adapter.js";

const createdAdapters: PhysicsAdapter[] = [];

afterEach(() => {
  while (createdAdapters.length > 0) {
    createdAdapters.pop()?.dispose();
  }
});

describe("physics adapter", () => {
  it("tracks pickup overlap queries through the gameplay-facing API", () => {
    const adapter = createAdapter();

    adapter.syncPlayer({
      playerId: "player-1",
      position: { x: 0, y: 1, z: 0 }
    });
    adapter.syncPickup({
      pickupId: "pickup-near",
      position: { x: 0.5, y: 1, z: 0 },
      active: true
    });
    adapter.syncPickup({
      pickupId: "pickup-far",
      position: { x: 4, y: 1, z: 0 },
      active: true
    });

    expect(adapter.getIntersectingPickupIds("player-1")).toEqual(["pickup-near"]);

    adapter.syncPickup({
      pickupId: "pickup-near",
      position: { x: 0.5, y: 1, z: 0 },
      active: false
    });

    expect(adapter.getIntersectingPickupIds("player-1")).toEqual([]);
  });

  it("resolves player motion against arena boundaries", () => {
    const adapter = createAdapter();

    adapter.syncPlayer({
      playerId: "player-1",
      position: { x: 0, y: 1, z: 0 }
    });

    const result = adapter.movePlayer("player-1", {
      x: 10,
      y: 0,
      z: 0
    });

    expect(result.blocked).toBe(true);
    expect(result.blockingActorId).toBeNull();
    expect(result.nextPosition.x).toBeGreaterThan(3);
    expect(result.nextPosition.x).toBeLessThan(3.4);
    const pose = adapter.getPlayerPose("player-1");
    expect(pose).not.toBeNull();
    expect(pose?.position.x).toBeCloseTo(result.nextPosition.x, 5);
    expect(pose?.position.y).toBe(1);
    expect(pose?.position.z).toBe(0);
  });

  it("reports the blocking player when player motion hits another player body", () => {
    const adapter = createAdapter();

    adapter.syncPlayer({
      playerId: "player-1",
      position: { x: -1, y: 1, z: 0 }
    });
    adapter.syncPlayer({
      playerId: "player-2",
      position: { x: 1, y: 1, z: 0 }
    });

    const result = adapter.movePlayer("player-1", {
      x: 3,
      y: 0,
      z: 0
    });

    expect(result.blocked).toBe(true);
    expect(result.blockingActorId).toBe("player-2");
    expect(result.nextPosition.x).toBeLessThan(0);
  });

  it("blocks player motion against arena structures", () => {
    const adapter = createStructuredAdapter();

    adapter.syncPlayer({
      playerId: "player-1",
      position: { x: -3, y: 1, z: 0 }
    });

    const result = adapter.movePlayer("player-1", {
      x: 4,
      y: 0,
      z: 0
    });

    expect(result.blocked).toBe(true);
    expect(result.blockingActorId).toBeNull();
    expect(result.nextPosition.x).toBeLessThanOrEqual(-1.75);
    expect(result.nextPosition.x).toBeGreaterThanOrEqual(-3);
  });

  it("slides along structure faces without snagging on the edge", () => {
    const adapter = createStructuredAdapter();

    adapter.syncPlayer({
      playerId: "player-1",
      position: { x: -1.75, y: 1, z: -2.2 }
    });

    const result = adapter.movePlayer("player-1", {
      x: 0,
      y: 0,
      z: 1
    });

    expect(result.blocked).toBe(false);
    expect(result.nextPosition.x).toBeCloseTo(-1.75, 5);
    expect(result.nextPosition.z).toBeCloseTo(-1.2, 5);
  });
});

function createAdapter(): PhysicsAdapter {
  const adapter = createPhysicsAdapter({
    arena: createArena(),
    rules: defaultSimulationRules
  });
  createdAdapters.push(adapter);
  return adapter;
}

function createArena(): ArenaLayout {
  return {
    bounds: {
      width: 8,
      height: 6,
      depth: 8
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
        pickupId: "pickup-near",
        position: { x: 0.5, y: 1, z: 0 },
        kind: "score-orb"
      }
    ],
    structures: []
  };
}

function createStructuredAdapter(): PhysicsAdapter {
  const adapter = createPhysicsAdapter({
    arena: createStructuredArena(),
    rules: defaultSimulationRules
  });
  createdAdapters.push(adapter);
  return adapter;
}

function createStructuredArena(): ArenaLayout {
  return {
    bounds: {
      width: 8,
      height: 6,
      depth: 8
    },
    playerSpawns: [
      {
        spawnId: "spawn-a",
        position: { x: -3, y: 1, z: 0 },
        yaw: 0
      }
    ],
    pickupSpawns: [
      {
        pickupId: "pickup-near",
        position: { x: 3, y: 1, z: 0 },
        kind: "score-orb"
      }
    ],
    structures: [
      {
        structureId: "center-block",
        position: { x: 0, y: 1, z: 0 },
        size: {
          width: 2,
          height: 2,
          depth: 2
        }
      }
    ]
  };
}
