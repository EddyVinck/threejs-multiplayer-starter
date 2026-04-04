import { lookInputSchema, type LookInput, type PlayerId, type RoomSnapshot, type Vector3 } from "@gamejam/shared";

const DEFAULT_FOLLOW_DISTANCE = 9;
const DEFAULT_TARGET_HEIGHT = 1.6;
const DEFAULT_MIN_PITCH = -1.1;
const DEFAULT_MAX_PITCH = 0.75;
const DEFAULT_POSITION_SHARPNESS = 10;
const DEFAULT_TARGET_SHARPNESS = 14;
const DEFAULT_INITIAL_PITCH = -0.35;

export type CameraPose = {
  position: Vector3;
  target: Vector3;
  yaw: number;
  pitch: number;
  distance: number;
};

export type CameraControllerOptions = {
  followDistance?: number;
  targetHeight?: number;
  minPitch?: number;
  maxPitch?: number;
  positionSharpness?: number;
  targetSharpness?: number;
  initialPitch?: number;
};

export type CameraController = {
  syncAuthoritativeSnapshot(snapshot: RoomSnapshot, localPlayerId: PlayerId): void;
  submitLookInput(look: LookInput): void;
  update(deltaSeconds: number): CameraPose | null;
  getPose(): CameraPose | null;
  reset(): void;
};

export function createCameraController(
  options: CameraControllerOptions = {}
): CameraController {
  const followDistance = Math.max(0.1, options.followDistance ?? DEFAULT_FOLLOW_DISTANCE);
  const targetHeight = options.targetHeight ?? DEFAULT_TARGET_HEIGHT;
  const minPitch = options.minPitch ?? DEFAULT_MIN_PITCH;
  const maxPitch = options.maxPitch ?? DEFAULT_MAX_PITCH;
  const positionSharpness = options.positionSharpness ?? DEFAULT_POSITION_SHARPNESS;
  const targetSharpness = options.targetSharpness ?? DEFAULT_TARGET_SHARPNESS;

  let followedPlayerId: PlayerId | null = null;
  let followedPlayerPosition: Vector3 | null = null;
  let fallbackYaw = 0;
  let desiredYaw = 0;
  let desiredPitch = clamp(
    options.initialPitch ?? DEFAULT_INITIAL_PITCH,
    minPitch,
    maxPitch
  );
  let hasExplicitLookInput = false;
  let pose: CameraPose | null = null;

  function resolveDesiredYaw(): number {
    return hasExplicitLookInput ? desiredYaw : fallbackYaw;
  }

  return {
    syncAuthoritativeSnapshot(snapshot, localPlayerId) {
      followedPlayerId = localPlayerId;
      const player = snapshot.players.find(
        (candidate) => candidate.playerId === localPlayerId
      );

      if (player === undefined || !player.connected) {
        followedPlayerPosition = null;
        return;
      }

      followedPlayerPosition = cloneVector(player.position);
      fallbackYaw = wrapAngle(player.yaw);
      if (!hasExplicitLookInput) {
        desiredYaw = fallbackYaw;
      }
    },

    submitLookInput(look) {
      const parsedLook = lookInputSchema.parse(look);
      desiredYaw = wrapAngle(parsedLook.yaw);
      desiredPitch = clamp(parsedLook.pitch, minPitch, maxPitch);
      hasExplicitLookInput = true;
    },

    update(deltaSeconds) {
      if (followedPlayerId === null || followedPlayerPosition === null) {
        return null;
      }

      const desiredTarget = {
        x: followedPlayerPosition.x,
        y: followedPlayerPosition.y + targetHeight,
        z: followedPlayerPosition.z
      };
      const nextYaw = resolveDesiredYaw();
      const desiredPosition = resolveOrbitPosition({
        target: desiredTarget,
        yaw: nextYaw,
        pitch: desiredPitch,
        distance: followDistance
      });

      if (pose === null) {
        pose = {
          position: desiredPosition,
          target: desiredTarget,
          yaw: nextYaw,
          pitch: desiredPitch,
          distance: followDistance
        };
        return clonePose(pose);
      }

      const safeDeltaSeconds = Number.isFinite(deltaSeconds)
        ? Math.max(0, deltaSeconds)
        : 0;
      pose.position = smoothVector(
        pose.position,
        desiredPosition,
        positionSharpness,
        safeDeltaSeconds
      );
      pose.target = smoothVector(
        pose.target,
        desiredTarget,
        targetSharpness,
        safeDeltaSeconds
      );
      pose.yaw = nextYaw;
      pose.pitch = desiredPitch;
      pose.distance = followDistance;
      return clonePose(pose);
    },

    getPose() {
      return pose === null ? null : clonePose(pose);
    },

    reset() {
      followedPlayerId = null;
      followedPlayerPosition = null;
      fallbackYaw = 0;
      desiredYaw = 0;
      desiredPitch = clamp(
        options.initialPitch ?? DEFAULT_INITIAL_PITCH,
        minPitch,
        maxPitch
      );
      hasExplicitLookInput = false;
      pose = null;
    }
  };
}

function resolveOrbitPosition(options: {
  target: Vector3;
  yaw: number;
  pitch: number;
  distance: number;
}): Vector3 {
  const horizontalDistance = Math.cos(options.pitch) * options.distance;

  return {
    x: options.target.x - Math.sin(options.yaw) * horizontalDistance,
    y: options.target.y - Math.sin(options.pitch) * options.distance,
    z: options.target.z + Math.cos(options.yaw) * horizontalDistance
  };
}

function smoothVector(
  current: Vector3,
  desired: Vector3,
  sharpness: number,
  deltaSeconds: number
): Vector3 {
  const alpha = resolveSmoothingAlpha(sharpness, deltaSeconds);

  return {
    x: lerp(current.x, desired.x, alpha),
    y: lerp(current.y, desired.y, alpha),
    z: lerp(current.z, desired.z, alpha)
  };
}

function resolveSmoothingAlpha(sharpness: number, deltaSeconds: number): number {
  if (sharpness <= 0 || deltaSeconds <= 0) {
    return 1;
  }

  return 1 - Math.exp(-sharpness * deltaSeconds);
}

function cloneVector(vector: Vector3): Vector3 {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z
  };
}

function clonePose(pose: CameraPose): CameraPose {
  return {
    position: cloneVector(pose.position),
    target: cloneVector(pose.target),
    yaw: pose.yaw,
    pitch: pose.pitch,
    distance: pose.distance
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha;
}

function wrapAngle(value: number): number {
  const wrapped = ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return wrapped - Math.PI;
}
