import type { PlayerCommand, RoomSnapshot, SessionJoined } from "@gamejam/shared";
import type { PerspectiveCamera, Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createRenderSceneAdapter } from "./render-scene-adapter.js";

type FakeRenderer = {
  lastCamera: PerspectiveCamera | null;
  lastScene: Scene | null;
  dispose(): void;
  render(scene: Scene, camera: PerspectiveCamera): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  disposeSpy: ReturnType<typeof vi.fn>;
  renderSpy: ReturnType<typeof vi.fn>;
  setSizeSpy: ReturnType<typeof vi.fn>;
};

describe("render scene adapter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps authoritative snapshots into lightweight scene primitives", () => {
    const canvas = createCanvasStub(960, 540);
    const renderer = createFakeRenderer();
    const adapter = createRenderSceneAdapter({
      canvas,
      createRenderer: () => renderer
    });

    adapter.syncSessionJoined(createJoined());
    adapter.syncAuthoritativeSnapshot(createSnapshot());
    adapter.renderFrame(100);

    expect(renderer.setSizeSpy).toHaveBeenCalledWith(960, 540, false);
    expect(renderer.lastScene?.getObjectByName("arena-floor")).not.toBeUndefined();
    expect(renderer.lastScene?.getObjectByName("arena-bounds")).not.toBeUndefined();
    expect(
      renderer.lastScene?.getObjectByName("arena-structure:platform-center")
    ).not.toBeUndefined();
    expect(renderer.lastScene?.getObjectByName("player:local-player")).not.toBeUndefined();
    expect(renderer.lastScene?.getObjectByName("player:remote-player")).not.toBeUndefined();
    expect(renderer.lastScene?.getObjectByName("pickup:pickup-center")?.visible).toBe(
      true
    );
    expect(renderer.lastScene?.getObjectByName("pickup:pickup-west")?.visible).toBe(
      false
    );
    expect(renderer.lastCamera?.position.y).toBeGreaterThan(0);

    adapter.dispose();
    expect(renderer.disposeSpy).toHaveBeenCalledTimes(1);
  });

  it("uses the movement runtime for local prediction between snapshots", () => {
    vi.useFakeTimers();

    const canvas = createCanvasStub(800, 450);
    const renderer = createFakeRenderer();
    const adapter = createRenderSceneAdapter({
      canvas,
      createRenderer: () => renderer
    });

    adapter.syncSessionJoined(createJoined());
    adapter.syncAuthoritativeSnapshot(createSnapshot());
    adapter.renderFrame(0);

    const initialPlayer = renderer.lastScene?.getObjectByName("player:local-player");
    expect(initialPlayer).not.toBeUndefined();
    const initialX = initialPlayer?.position.x ?? 0;

    adapter.start();
    adapter.submitPlayerCommand(createMoveRightCommand());
    vi.advanceTimersByTime(55);
    adapter.renderFrame(55);

    const predictedPlayer = renderer.lastScene?.getObjectByName("player:local-player");
    expect(predictedPlayer?.position.x).toBeGreaterThan(initialX + 0.2);

    adapter.stop();
    adapter.dispose();
  });
});

function createFakeRenderer(): FakeRenderer {
  const setSizeSpy = vi.fn();
  const renderSpy = vi.fn();
  const disposeSpy = vi.fn();
  const fakeRenderer: FakeRenderer = {
    setSize(width: number, height: number, updateStyle?: boolean) {
      setSizeSpy(width, height, updateStyle);
    },
    render(scene: Scene, camera: PerspectiveCamera) {
      fakeRenderer.lastScene = scene;
      fakeRenderer.lastCamera = camera;
      renderSpy(scene, camera);
    },
    dispose() {
      disposeSpy();
    },
    lastScene: null,
    lastCamera: null,
    setSizeSpy,
    renderSpy,
    disposeSpy
  };

  return fakeRenderer;
}

function createCanvasStub(width: number, height: number): HTMLCanvasElement {
  return {
    width,
    height
  } as HTMLCanvasElement;
}

function createJoined(): SessionJoined {
  return {
    mode: "single-player",
    playerId: "local-player",
    roomId: "room-1",
    roomCode: "PLAYER",
    visibility: "private",
    lateJoin: false
  };
}

function createSnapshot(): RoomSnapshot {
  return {
    roomId: "room-1",
    roomCode: "PLAYER",
    mode: "single-player",
    visibility: "private",
    lateJoinAllowed: false,
    serverTick: 12,
    rules: {
      tickRate: 20,
      maxPlayers: 4,
      playerCollisionRadius: 0.75,
      round: {
        durationMs: 60_000,
        resetDurationMs: 3_000
      },
      pickup: {
        scoreValue: 1,
        collisionRadius: 1.25,
        respawnTicks: 40
      }
    },
    arena: {
      bounds: {
        width: 24,
        height: 8,
        depth: 24
      },
      playerSpawns: [
        {
          spawnId: "spawn-local",
          position: { x: 0, y: 1, z: 0 },
          yaw: 0
        }
      ],
      pickupSpawns: [
        {
          pickupId: "pickup-center",
          position: { x: 2, y: 1, z: 0 },
          kind: "score-orb"
        },
        {
          pickupId: "pickup-west",
          position: { x: -2, y: 1, z: 0 },
          kind: "score-orb"
        }
      ],
      structures: [
        {
          structureId: "platform-center",
          position: { x: 6, y: 1, z: 6 },
          size: {
            width: 6,
            height: 2,
            depth: 6
          }
        }
      ]
    },
    round: {
      phase: "active",
      roundNumber: 0,
      remainingMs: 45_000
    },
    players: [
      {
        playerId: "local-player",
        displayName: "Player 1",
        position: { x: 0, y: 1, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        score: 0,
        connected: true
      },
      {
        playerId: "remote-player",
        displayName: "Player 2",
        position: { x: 4, y: 1, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        yaw: Math.PI / 2,
        score: 1,
        connected: true
      }
    ],
    pickups: [
      {
        pickupId: "pickup-center",
        position: { x: 2, y: 1, z: 0 },
        active: true,
        respawnAtTick: null
      },
      {
        pickupId: "pickup-west",
        position: { x: -2, y: 1, z: 0 },
        active: false,
        respawnAtTick: 24
      }
    ]
  };
}

function createMoveRightCommand(): PlayerCommand {
  return {
    sequence: 1,
    deltaMs: 50,
    move: {
      x: 1,
      y: 0,
      z: 0
    },
    look: {
      yaw: 0.45,
      pitch: -0.2
    },
    actions: {
      jump: false,
      primary: false,
      secondary: false
    }
  };
}
