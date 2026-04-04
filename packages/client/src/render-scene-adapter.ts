import type { PlayerCommand, RoomSnapshot, SessionJoined } from "@gamejam/shared";
import * as THREE from "three";

import {
  createCameraController,
  type CameraController,
  type CameraPose
} from "./camera-controller.js";
import {
  createMovementRuntime,
  type MovementRuntime
} from "./movement-runtime.js";
import { cloneSessionData } from "./session-snapshot.js";

const FLOOR_COLOR = new THREE.Color("#0f172a");
const FLOOR_GRID_COLOR = new THREE.Color("#2f4568");
const ARENA_BOUNDS_COLOR = new THREE.Color("#4f78a8");
const ARENA_STRUCTURE_COLOR = new THREE.Color("#334155");
const ARENA_STRUCTURE_TRIM_COLOR = new THREE.Color("#7dd3fc");
const LOCAL_PLAYER_COLOR = new THREE.Color("#7dd3fc");
const REMOTE_PLAYER_COLOR = new THREE.Color("#f59e0b");
const DISCONNECTED_PLAYER_COLOR = new THREE.Color("#64748b");
const PICKUP_COLOR = new THREE.Color("#86efac");
const PICKUP_INACTIVE_COLOR = new THREE.Color("#29483b");

type SceneRenderer = Pick<THREE.WebGLRenderer, "dispose" | "render" | "setSize">;

type PlayerVisual = {
  group: THREE.Group;
  bodyMaterial: THREE.MeshStandardMaterial;
  markerMaterial: THREE.MeshStandardMaterial;
};

type PickupVisual = {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
};

type SnapshotSample = {
  receivedAtMs: number;
  snapshot: RoomSnapshot;
};

export type FrameMetricsPayload = {
  frameTimeMs: number;
  fps: number;
  canvasWidth: number;
  canvasHeight: number;
};

export type RenderSceneAdapterOptions = {
  canvas: HTMLCanvasElement;
  cameraController?: CameraController;
  clock?: () => number;
  createRenderer?: (canvas: HTMLCanvasElement) => SceneRenderer;
  movementRuntime?: MovementRuntime;
  cancelAnimationFrame?: typeof globalThis.cancelAnimationFrame;
  requestAnimationFrame?: typeof globalThis.requestAnimationFrame;
  /** Called once per rendered frame after `renderer.render` (for diagnostics). */
  onFrameMetrics?: (metrics: FrameMetricsPayload) => void;
};

export type RenderSceneAdapter = {
  syncSessionJoined(joined: SessionJoined): void;
  syncAuthoritativeSnapshot(snapshot: RoomSnapshot): void;
  submitPlayerCommand(command: PlayerCommand): void;
  renderFrame(frameTimeMs?: number): void;
  start(): void;
  stop(): void;
  isRunning(): boolean;
  dispose(): void;
};

const MAX_SNAPSHOT_SAMPLES = 6;

export function createRenderSceneAdapter(
  options: RenderSceneAdapterOptions
): RenderSceneAdapter {
  const cameraController = options.cameraController ?? createCameraController();
  const movementRuntime = options.movementRuntime ?? createMovementRuntime();
  const renderer = (options.createRenderer ?? createDefaultRenderer)(options.canvas);
  const clock = options.clock ?? defaultClock;
  const requestAnimationFrameImpl =
    options.requestAnimationFrame ?? globalThis.requestAnimationFrame?.bind(globalThis);
  const cancelAnimationFrameImpl =
    options.cancelAnimationFrame ?? globalThis.cancelAnimationFrame?.bind(globalThis);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#05070d");

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 8, 16);

  const arenaRoot = new THREE.Group();
  arenaRoot.name = "arena-root";
  scene.add(arenaRoot);

  const playersRoot = new THREE.Group();
  playersRoot.name = "players-root";
  scene.add(playersRoot);

  const pickupsRoot = new THREE.Group();
  pickupsRoot.name = "pickups-root";
  scene.add(pickupsRoot);

  const hemisphereLight = new THREE.HemisphereLight("#dbeafe", "#020617", 1.35);
  hemisphereLight.name = "hemisphere-light";
  scene.add(hemisphereLight);

  const directionalLight = new THREE.DirectionalLight("#ffffff", 1.6);
  directionalLight.name = "directional-light";
  directionalLight.position.set(8, 18, 6);
  scene.add(directionalLight);

  const playerVisuals = new Map<string, PlayerVisual>();
  const pickupVisuals = new Map<string, PickupVisual>();

  let running = false;
  let frameHandle: number | null = null;
  let joined: SessionJoined | null = null;
  let authoritativeSnapshot: RoomSnapshot | null = null;
  let snapshotSamples: SnapshotSample[] = [];
  let lastFrameTimeMs: number | null = null;
  let arenaKey: string | null = null;
  let disposed = false;
  let rendererWidth = 0;
  let rendererHeight = 0;
  let fpsWindowStartMs = 0;
  let fpsFramesInWindow = 0;
  let lastReportedFps = 0;
  const onFrameMetrics = options.onFrameMetrics;

  function syncRuntimeSnapshot(snapshot: RoomSnapshot): void {
    if (joined === null) {
      return;
    }

    movementRuntime.syncAuthoritativeSnapshot(snapshot, joined.playerId);
  }

  function recordAuthoritativeSnapshot(snapshot: RoomSnapshot, receivedAtMs: number): void {
    const nextSnapshot = cloneSessionData(snapshot);
    authoritativeSnapshot = nextSnapshot;

    const lastSample = snapshotSamples.at(-1) ?? null;
    if (lastSample !== null && nextSnapshot.serverTick <= lastSample.snapshot.serverTick) {
      snapshotSamples =
        nextSnapshot.serverTick === lastSample.snapshot.serverTick
          ? [
              ...snapshotSamples.slice(0, -1),
              {
                receivedAtMs,
                snapshot: nextSnapshot
              }
            ]
          : [
              {
                receivedAtMs,
                snapshot: nextSnapshot
              }
            ];
      return;
    }

    snapshotSamples.push({
      receivedAtMs,
      snapshot: nextSnapshot
    });
    if (snapshotSamples.length > MAX_SNAPSHOT_SAMPLES) {
      snapshotSamples = snapshotSamples.slice(-MAX_SNAPSHOT_SAMPLES);
    }
  }

  function resolveRenderableSnapshot(frameTimeMs: number): RoomSnapshot | null {
    const authoritativeRenderable = resolveInterpolatedSnapshot(frameTimeMs);
    const predictedSnapshot = movementRuntime.getSnapshot();
    if (predictedSnapshot === null) {
      return authoritativeRenderable;
    }
    if (authoritativeRenderable === null || joined === null) {
      return predictedSnapshot;
    }
    const joinedPlayerId = joined.playerId;

    const predictedLocalPlayer = predictedSnapshot.players.find(
      (player) => player.playerId === joinedPlayerId
    );
    if (predictedLocalPlayer === undefined) {
      return authoritativeRenderable;
    }

    return {
      ...authoritativeRenderable,
      players: authoritativeRenderable.players.map((player) =>
        player.playerId === joinedPlayerId ? cloneSessionData(predictedLocalPlayer) : player
      )
    };
  }

  function resolveInterpolatedSnapshot(frameTimeMs: number): RoomSnapshot | null {
    const firstSample = snapshotSamples[0];
    const latestSample = snapshotSamples[snapshotSamples.length - 1];
    if (firstSample === undefined || latestSample === undefined) {
      return null;
    }
    if (snapshotSamples.length === 1) {
      return cloneSessionData(firstSample.snapshot);
    }

    const interpolationDelayMs = 1000 / latestSample.snapshot.rules.tickRate;
    const renderTimeMs = frameTimeMs - interpolationDelayMs;

    while (snapshotSamples.length > 2) {
      const nextSample = snapshotSamples[1];
      if (nextSample === undefined || nextSample.receivedAtMs > renderTimeMs) {
        break;
      }
      snapshotSamples.shift();
    }

    const startSample = snapshotSamples[0];
    const endSample = snapshotSamples[1] ?? snapshotSamples[0];
    if (endSample === undefined || startSample === undefined) {
      return authoritativeSnapshot === null ? null : cloneSessionData(authoritativeSnapshot);
    }

    if (renderTimeMs <= startSample.receivedAtMs) {
      return cloneSessionData(startSample.snapshot);
    }
    if (renderTimeMs >= endSample.receivedAtMs || endSample.receivedAtMs <= startSample.receivedAtMs) {
      return cloneSessionData(endSample.snapshot);
    }

    const alpha =
      (renderTimeMs - startSample.receivedAtMs) /
      (endSample.receivedAtMs - startSample.receivedAtMs);

    return interpolateSnapshot(startSample.snapshot, endSample.snapshot, alpha);
  }

  function scheduleNextFrame(): void {
    if (!running || requestAnimationFrameImpl === undefined) {
      return;
    }

    frameHandle = requestAnimationFrameImpl((frameTimeMs) => {
      frameHandle = null;
      renderFrame(frameTimeMs);
      scheduleNextFrame();
    });
  }

  function ensureRendererSize(): void {
    const width = Math.max(1, options.canvas.width);
    const height = Math.max(1, options.canvas.height);

    if (rendererWidth === width && rendererHeight === height) {
      return;
    }

    rendererWidth = width;
    rendererHeight = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function renderFrame(frameTimeMs = clock()): void {
    if (disposed) {
      return;
    }

    ensureRendererSize();

    const deltaSeconds =
      lastFrameTimeMs === null
        ? 0
        : Math.max(0, (frameTimeMs - lastFrameTimeMs) / 1000);
    lastFrameTimeMs = frameTimeMs;

    if (movementRuntime.isRunning()) {
      movementRuntime.advance(deltaSeconds);
    }

    const renderableSnapshot = resolveRenderableSnapshot(frameTimeMs);
    if (renderableSnapshot !== null) {
      syncSceneSnapshot(renderableSnapshot);
      if (joined !== null) {
        cameraController.syncAuthoritativeSnapshot(
          renderableSnapshot,
          joined.playerId
        );
      }
    }

    const pose = cameraController.update(deltaSeconds);
    if (pose !== null) {
      applyCameraPose(camera, pose);
    }

    renderer.render(scene, camera);

    if (onFrameMetrics !== undefined) {
      if (fpsFramesInWindow === 0) {
        fpsWindowStartMs = frameTimeMs;
      }
      fpsFramesInWindow += 1;
      const elapsed = frameTimeMs - fpsWindowStartMs;
      if (elapsed >= 500) {
        lastReportedFps = Math.round((fpsFramesInWindow / elapsed) * 1000);
        fpsWindowStartMs = frameTimeMs;
        fpsFramesInWindow = 0;
      }

      onFrameMetrics({
        frameTimeMs,
        fps: lastReportedFps,
        canvasWidth: options.canvas.width,
        canvasHeight: options.canvas.height
      });
    }
  }

  function syncSceneSnapshot(snapshot: RoomSnapshot): void {
    syncArena(snapshot);
    syncPlayers(snapshot);
    syncPickups(snapshot);
  }

  function syncArena(snapshot: RoomSnapshot): void {
    const nextArenaKey = JSON.stringify(snapshot.arena);
    if (arenaKey === nextArenaKey) {
      return;
    }

    arenaKey = nextArenaKey;
    disposeChildren(arenaRoot);

    const { width, height, depth } = snapshot.arena.bounds;

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.25, depth),
      new THREE.MeshStandardMaterial({
        color: FLOOR_COLOR,
        roughness: 0.95,
        metalness: 0.05
      })
    );
    floor.name = "arena-floor";
    floor.position.set(0, -0.125, 0);
    arenaRoot.add(floor);

    const grid = new THREE.GridHelper(
      Math.max(width, depth),
      Math.max(2, Math.round(Math.max(width, depth))),
      FLOOR_GRID_COLOR,
      FLOOR_GRID_COLOR
    );
    grid.name = "arena-grid";
    grid.position.y = 0.01;
    arenaRoot.add(grid);

    const bounds = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)),
      new THREE.LineBasicMaterial({
        color: ARENA_BOUNDS_COLOR
      })
    );
    bounds.name = "arena-bounds";
    bounds.position.set(0, height / 2, 0);
    arenaRoot.add(bounds);

    const spawnMarkers = new THREE.Group();
    spawnMarkers.name = "arena-spawn-markers";
    arenaRoot.add(spawnMarkers);

    for (const spawn of snapshot.arena.playerSpawns) {
      const marker = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12),
        new THREE.MeshStandardMaterial({
          color: "#60a5fa",
          emissive: "#1d4ed8",
          emissiveIntensity: 0.25
        })
      );
      marker.name = `spawn:${spawn.spawnId}`;
      marker.position.set(spawn.position.x, 0.06, spawn.position.z);
      spawnMarkers.add(marker);
    }

    const structures = new THREE.Group();
    structures.name = "arena-structures";
    arenaRoot.add(structures);

    for (const structure of snapshot.arena.structures) {
      const structureRoot = new THREE.Group();
      structureRoot.name = `arena-structure:${structure.structureId}`;
      structureRoot.position.set(
        structure.position.x,
        structure.position.y,
        structure.position.z
      );

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(
          structure.size.width,
          structure.size.height,
          structure.size.depth
        ),
        new THREE.MeshStandardMaterial({
          color: ARENA_STRUCTURE_COLOR,
          roughness: 0.92,
          metalness: 0.06
        })
      );
      body.name = `${structureRoot.name}:body`;
      structureRoot.add(body);

      const trim = new THREE.LineSegments(
        new THREE.EdgesGeometry(
          new THREE.BoxGeometry(
            structure.size.width,
            structure.size.height,
            structure.size.depth
          )
        ),
        new THREE.LineBasicMaterial({
          color: ARENA_STRUCTURE_TRIM_COLOR
        })
      );
      trim.name = `${structureRoot.name}:trim`;
      structureRoot.add(trim);

      structures.add(structureRoot);
    }
  }

  function syncPlayers(snapshot: RoomSnapshot): void {
    const nextPlayerIds = new Set(snapshot.players.map((player) => player.playerId));

    for (const [playerId, visual] of playerVisuals) {
      if (nextPlayerIds.has(playerId)) {
        continue;
      }

      playersRoot.remove(visual.group);
      disposeObject3D(visual.group);
      playerVisuals.delete(playerId);
    }

    for (const player of snapshot.players) {
      let visual = playerVisuals.get(player.playerId);
      if (visual === undefined) {
        visual = createPlayerVisual(player.playerId);
        playerVisuals.set(player.playerId, visual);
        playersRoot.add(visual.group);
      }

      visual.group.position.set(
        player.position.x,
        player.position.y,
        player.position.z
      );
      visual.group.rotation.set(0, -player.yaw, 0);

      const color = !player.connected
        ? DISCONNECTED_PLAYER_COLOR
        : player.playerId === joined?.playerId
          ? LOCAL_PLAYER_COLOR
          : REMOTE_PLAYER_COLOR;

      visual.bodyMaterial.color.copy(color);
      visual.markerMaterial.color.copy(color);
      visual.markerMaterial.emissive.copy(color);
      visual.markerMaterial.emissiveIntensity =
        player.playerId === joined?.playerId ? 0.45 : 0.18;
    }
  }

  function syncPickups(snapshot: RoomSnapshot): void {
    const nextPickupIds = new Set(snapshot.pickups.map((pickup) => pickup.pickupId));

    for (const [pickupId, visual] of pickupVisuals) {
      if (nextPickupIds.has(pickupId)) {
        continue;
      }

      pickupsRoot.remove(visual.mesh);
      disposeObject3D(visual.mesh);
      pickupVisuals.delete(pickupId);
    }

    for (const pickup of snapshot.pickups) {
      let visual = pickupVisuals.get(pickup.pickupId);
      if (visual === undefined) {
        visual = createPickupVisual(pickup.pickupId);
        pickupVisuals.set(pickup.pickupId, visual);
        pickupsRoot.add(visual.mesh);
      }

      visual.mesh.position.set(
        pickup.position.x,
        pickup.position.y,
        pickup.position.z
      );
      visual.mesh.visible = pickup.active;
      visual.mesh.rotation.y = snapshot.serverTick * 0.08;
      visual.material.color.copy(
        pickup.active ? PICKUP_COLOR : PICKUP_INACTIVE_COLOR
      );
      visual.material.emissive.copy(
        pickup.active ? PICKUP_COLOR : PICKUP_INACTIVE_COLOR
      );
      visual.material.emissiveIntensity = pickup.active ? 0.35 : 0.05;
    }
  }

  return {
    syncSessionJoined(nextJoined) {
      joined = cloneSessionData(nextJoined);
      if (authoritativeSnapshot !== null) {
        syncRuntimeSnapshot(authoritativeSnapshot);
      }
    },

    syncAuthoritativeSnapshot(snapshot) {
      recordAuthoritativeSnapshot(snapshot, clock());
      if (authoritativeSnapshot !== null) {
        syncRuntimeSnapshot(authoritativeSnapshot);
      }
    },

    submitPlayerCommand(command) {
      movementRuntime.submitPlayerCommand(command);
      cameraController.submitLookInput(command.look);
    },

    renderFrame,

    start() {
      if (running || disposed) {
        return;
      }

      running = true;
      movementRuntime.start();
      scheduleNextFrame();
    },

    stop() {
      if (!running) {
        return;
      }

      running = false;
      movementRuntime.stop();
      if (frameHandle !== null && cancelAnimationFrameImpl !== undefined) {
        cancelAnimationFrameImpl(frameHandle);
        frameHandle = null;
      }
      lastFrameTimeMs = null;
      fpsWindowStartMs = 0;
      fpsFramesInWindow = 0;
      lastReportedFps = 0;
    },

    isRunning() {
      return running;
    },

    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      this.stop();
      movementRuntime.dispose();
      renderer.dispose();
      disposeChildren(arenaRoot);
      disposeChildren(playersRoot);
      disposeChildren(pickupsRoot);
      playerVisuals.clear();
      pickupVisuals.clear();
      cameraController.reset();
      authoritativeSnapshot = null;
      snapshotSamples = [];
      joined = null;
      arenaKey = null;
    }
  };
}

function interpolateSnapshot(
  startSnapshot: RoomSnapshot,
  endSnapshot: RoomSnapshot,
  alpha: number
): RoomSnapshot {
  const clampedAlpha = clamp(alpha, 0, 1);
  const startPlayersById = new Map(
    startSnapshot.players.map((player) => [player.playerId, player] as const)
  );

  return {
    ...cloneSessionData(endSnapshot),
    players: endSnapshot.players.map((player) => {
      const startPlayer = startPlayersById.get(player.playerId);
      if (startPlayer === undefined) {
        return cloneSessionData(player);
      }

      return {
        ...cloneSessionData(player),
        position: {
          x: lerp(startPlayer.position.x, player.position.x, clampedAlpha),
          y: lerp(startPlayer.position.y, player.position.y, clampedAlpha),
          z: lerp(startPlayer.position.z, player.position.z, clampedAlpha)
        },
        velocity: {
          x: lerp(startPlayer.velocity.x, player.velocity.x, clampedAlpha),
          y: lerp(startPlayer.velocity.y, player.velocity.y, clampedAlpha),
          z: lerp(startPlayer.velocity.z, player.velocity.z, clampedAlpha)
        },
        yaw: lerpAngle(startPlayer.yaw, player.yaw, clampedAlpha)
      };
    })
  };
}

function createDefaultRenderer(canvas: HTMLCanvasElement): SceneRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: false,
    powerPreference: "high-performance"
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.NoToneMapping;
  return renderer;
}

function createPlayerVisual(playerId: string): PlayerVisual {
  const group = new THREE.Group();
  group.name = `player:${playerId}`;

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: REMOTE_PLAYER_COLOR,
    roughness: 0.55,
    metalness: 0.08
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.6, 1), bodyMaterial);
  body.name = `${group.name}:body`;
  group.add(body);

  const markerMaterial = new THREE.MeshStandardMaterial({
    color: REMOTE_PLAYER_COLOR,
    emissive: REMOTE_PLAYER_COLOR,
    emissiveIntensity: 0.18,
    roughness: 0.35,
    metalness: 0.1
  });
  const marker = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.45, 12),
    markerMaterial
  );
  marker.name = `${group.name}:marker`;
  marker.position.set(0, 0.2, -0.82);
  marker.rotation.x = -Math.PI / 2;
  group.add(marker);

  return {
    group,
    bodyMaterial,
    markerMaterial
  };
}

function createPickupVisual(pickupId: string): PickupVisual {
  const material = new THREE.MeshStandardMaterial({
    color: PICKUP_COLOR,
    emissive: PICKUP_COLOR,
    emissiveIntensity: 0.35,
    roughness: 0.4,
    metalness: 0.18
  });
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), material);
  mesh.name = `pickup:${pickupId}`;

  return {
    mesh,
    material
  };
}

function applyCameraPose(
  camera: THREE.PerspectiveCamera,
  pose: CameraPose
): void {
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
}

function disposeChildren(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeObject3D(child);
  }
}

function disposeObject3D(object: THREE.Object3D): void {
  object.traverse((child: THREE.Object3D) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();

    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const entry of material) {
        entry.dispose();
      }
      return;
    }

    material?.dispose?.();
  });
}

function defaultClock(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha;
}

function lerpAngle(start: number, end: number, alpha: number): number {
  const shortestDelta = wrapAngle(end - start);
  return wrapAngle(start + shortestDelta * alpha);
}

function wrapAngle(value: number): number {
  const wrapped = ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return wrapped - Math.PI;
}
