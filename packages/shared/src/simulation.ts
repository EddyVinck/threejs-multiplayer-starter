import { z } from "zod";

import { roomCodeSchema } from "./room-code.js";
import {
  displayNameSchema,
  entityIdSchema,
  finiteNumberSchema,
  nonNegativeIntegerSchema,
  playerIdSchema,
  roomIdSchema,
  roomVisibilitySchema,
  roundPhaseSchema,
  sessionModeSchema,
  vector3Schema,
  type Vector3
} from "./schemas.js";

export const positiveIntegerSchema = z.number().int().positive();
export const positiveNumberSchema = z.number().positive();

export const DEFAULT_SIMULATION_TICK_RATE = 20;
export const DEFAULT_SIMULATION_MAX_PLAYERS = 8;
export const DEFAULT_ROUND_DURATION_MS = 60_000;
export const DEFAULT_ROUND_RESET_DURATION_MS = 3_000;
export const DEFAULT_PICKUP_RESPAWN_TICKS = 40;
export const DEFAULT_PICKUP_SCORE_VALUE = 1;
export const DEFAULT_PLAYER_COLLISION_RADIUS = 0.75;
export const DEFAULT_PICKUP_COLLISION_RADIUS = 1.25;
export const DEFAULT_PLAYER_MOVE_SPEED = 6;

export const pickupKindSchema = z.enum(["score-orb"]);
export const roundResetReasonSchema = z.enum(["round-complete", "manual"]);

export const scoreStateSchema = z.object({
  total: nonNegativeIntegerSchema,
  pickupsCollected: nonNegativeIntegerSchema,
  lastPickupTick: nonNegativeIntegerSchema.nullable()
});

export const roundRulesSchema = z.object({
  durationMs: positiveIntegerSchema,
  resetDurationMs: nonNegativeIntegerSchema
});

export const pickupRulesSchema = z.object({
  scoreValue: positiveIntegerSchema,
  collisionRadius: positiveNumberSchema,
  respawnTicks: positiveIntegerSchema
});

export const simulationRulesSchema = z.object({
  tickRate: positiveIntegerSchema,
  maxPlayers: positiveIntegerSchema,
  playerCollisionRadius: positiveNumberSchema,
  round: roundRulesSchema,
  pickup: pickupRulesSchema
});

export const arenaBoundsSchema = z.object({
  width: positiveNumberSchema,
  height: positiveNumberSchema,
  depth: positiveNumberSchema
});

export const playerSpawnPointSchema = z.object({
  spawnId: entityIdSchema,
  position: vector3Schema,
  yaw: finiteNumberSchema
});

export const pickupSpawnPointSchema = z.object({
  pickupId: entityIdSchema,
  position: vector3Schema,
  kind: pickupKindSchema
});

export const arenaStructureSchema = z.object({
  structureId: entityIdSchema,
  position: vector3Schema,
  size: z.object({
    width: positiveNumberSchema,
    height: positiveNumberSchema,
    depth: positiveNumberSchema
  })
});

export const arenaLayoutSchema = z.object({
  bounds: arenaBoundsSchema,
  playerSpawns: z.array(playerSpawnPointSchema).min(1),
  pickupSpawns: z.array(pickupSpawnPointSchema).min(1),
  structures: z.array(arenaStructureSchema).default([])
});

export const roundResetStateSchema = z.object({
  reason: roundResetReasonSchema,
  scheduledAtTick: nonNegativeIntegerSchema,
  resetAtTick: nonNegativeIntegerSchema
});

export const roundTimerStateSchema = z.object({
  phase: roundPhaseSchema,
  roundNumber: nonNegativeIntegerSchema,
  startedAtTick: nonNegativeIntegerSchema,
  endsAtTick: nonNegativeIntegerSchema,
  reset: roundResetStateSchema.nullable()
});

export const simulationPlayerStateSchema = z.object({
  playerId: playerIdSchema,
  displayName: displayNameSchema,
  connected: z.boolean(),
  joinedAtTick: nonNegativeIntegerSchema,
  spawnId: entityIdSchema,
  position: vector3Schema,
  velocity: vector3Schema,
  yaw: finiteNumberSchema,
  score: scoreStateSchema,
  lastProcessedCommandSequence: nonNegativeIntegerSchema
});

export const simulationPickupStateSchema = z.object({
  pickupId: entityIdSchema,
  kind: pickupKindSchema,
  spawnId: entityIdSchema,
  position: vector3Schema,
  active: z.boolean(),
  scoreValue: positiveIntegerSchema,
  collectedByPlayerId: playerIdSchema.nullable(),
  collectedAtTick: nonNegativeIntegerSchema.nullable(),
  respawnAtTick: nonNegativeIntegerSchema.nullable()
});

export const authoritativeRoomStateSchema = z.object({
  roomId: roomIdSchema,
  roomCode: roomCodeSchema,
  mode: sessionModeSchema,
  visibility: roomVisibilitySchema,
  lateJoinAllowed: z.boolean(),
  serverTick: nonNegativeIntegerSchema,
  rules: simulationRulesSchema,
  arena: arenaLayoutSchema,
  round: roundTimerStateSchema,
  players: z.array(simulationPlayerStateSchema),
  pickups: z.array(simulationPickupStateSchema)
});

export const defaultSimulationRules = simulationRulesSchema.parse({
  tickRate: DEFAULT_SIMULATION_TICK_RATE,
  maxPlayers: DEFAULT_SIMULATION_MAX_PLAYERS,
  playerCollisionRadius: DEFAULT_PLAYER_COLLISION_RADIUS,
  round: {
    durationMs: DEFAULT_ROUND_DURATION_MS,
    resetDurationMs: DEFAULT_ROUND_RESET_DURATION_MS
  },
  pickup: {
    scoreValue: DEFAULT_PICKUP_SCORE_VALUE,
    collisionRadius: DEFAULT_PICKUP_COLLISION_RADIUS,
    respawnTicks: DEFAULT_PICKUP_RESPAWN_TICKS
  }
});

export type PickupKind = z.infer<typeof pickupKindSchema>;
export type RoundResetReason = z.infer<typeof roundResetReasonSchema>;
export type ScoreState = z.infer<typeof scoreStateSchema>;
export type RoundRules = z.infer<typeof roundRulesSchema>;
export type PickupRules = z.infer<typeof pickupRulesSchema>;
export type SimulationRules = z.infer<typeof simulationRulesSchema>;
export type ArenaBounds = z.infer<typeof arenaBoundsSchema>;
export type PlayerSpawnPoint = z.infer<typeof playerSpawnPointSchema>;
export type PickupSpawnPoint = z.infer<typeof pickupSpawnPointSchema>;
export type ArenaStructure = z.infer<typeof arenaStructureSchema>;
export type ArenaLayout = z.infer<typeof arenaLayoutSchema>;
export type RoundResetState = z.infer<typeof roundResetStateSchema>;
export type RoundTimerState = z.infer<typeof roundTimerStateSchema>;
export type SimulationPlayerState = z.infer<typeof simulationPlayerStateSchema>;
export type SimulationPickupState = z.infer<typeof simulationPickupStateSchema>;
export type AuthoritativeRoomState = z.infer<typeof authoritativeRoomStateSchema>;

export type ArenaMotionResolution = {
  nextPosition: Vector3;
  blocked: boolean;
};

export function resolvePlayerVelocity(
  move: {
    x: number;
    y: number;
    z: number;
  },
  yaw = 0,
  speed = DEFAULT_PLAYER_MOVE_SPEED
): Vector3 {
  const normalizedMove = normalizeMovementInput(move);
  const rotatedHorizontal = rotateHorizontalInput(normalizedMove, yaw);

  return {
    x: rotatedHorizontal.x * speed,
    y: normalizedMove.y * speed,
    z: rotatedHorizontal.z * speed
  };
}

function rotateHorizontalInput(
  vector: {
    x: number;
    z: number;
  },
  yaw: number
): Pick<Vector3, "x" | "z"> {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);

  return {
    x: vector.x * cosine - vector.z * sine,
    z: vector.x * sine + vector.z * cosine
  };
}

export function resolveArenaMotion(options: {
  currentPosition: Vector3;
  desiredTranslation: Vector3;
  arena: ArenaLayout;
  collisionRadius: number;
  boundsPadding?: number;
}): ArenaMotionResolution {
  const boundsPadding = options.boundsPadding ?? 0;
  let nextPosition = clampPositionToArena(
    addVector(options.currentPosition, options.desiredTranslation),
    options.arena,
    boundsPadding
  );
  let blocked = !areVectorsEqual(nextPosition, addVector(options.currentPosition, options.desiredTranslation));

  if (
    !overlapsAnyArenaStructure(
      nextPosition,
      options.arena,
      options.collisionRadius
    )
  ) {
    return {
      nextPosition,
      blocked
    };
  }

  nextPosition = options.currentPosition;

  for (const axis of ["x", "y", "z"] as const) {
    const axisTranslation = options.desiredTranslation[axis];
    if (axisTranslation === 0) {
      continue;
    }

    const candidate = clampPositionToArena(
      {
        ...nextPosition,
        [axis]: nextPosition[axis] + axisTranslation
      },
      options.arena,
      boundsPadding
    );

    if (
      overlapsAnyArenaStructure(
        candidate,
        options.arena,
        options.collisionRadius
      )
    ) {
      blocked = true;
      continue;
    }

    nextPosition = candidate;
  }

  return {
    nextPosition,
    blocked
  };
}

function normalizeMovementInput(vector: {
  x: number;
  y: number;
  z: number;
}): Vector3 {
  const lengthSquared =
    vector.x * vector.x + vector.y * vector.y + vector.z * vector.z;
  if (lengthSquared <= 1) {
    return {
      x: vector.x,
      y: vector.y,
      z: vector.z
    };
  }

  const length = Math.sqrt(lengthSquared);
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}

function addVector(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z
  };
}

function areVectorsEqual(left: Vector3, right: Vector3): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function clampPositionToArena(
  position: Vector3,
  arena: ArenaLayout,
  boundsPadding: number
): Vector3 {
  const halfWidth = arena.bounds.width / 2;
  const halfDepth = arena.bounds.depth / 2;

  return {
    x: clamp(position.x, -(halfWidth - boundsPadding), halfWidth - boundsPadding),
    y: clamp(position.y, boundsPadding, arena.bounds.height - boundsPadding),
    z: clamp(position.z, -(halfDepth - boundsPadding), halfDepth - boundsPadding)
  };
}

function overlapsAnyArenaStructure(
  position: Vector3,
  arena: ArenaLayout,
  collisionRadius: number
): boolean {
  return arena.structures.some((structure) =>
    overlapsArenaStructure(position, structure, collisionRadius)
  );
}

function overlapsArenaStructure(
  position: Vector3,
  structure: ArenaStructure,
  collisionRadius: number
): boolean {
  const minX = structure.position.x - structure.size.width / 2 - collisionRadius;
  const maxX = structure.position.x + structure.size.width / 2 + collisionRadius;
  const minY = structure.position.y - structure.size.height / 2 - collisionRadius;
  const maxY = structure.position.y + structure.size.height / 2 + collisionRadius;
  const minZ = structure.position.z - structure.size.depth / 2 - collisionRadius;
  const maxZ = structure.position.z + structure.size.depth / 2 + collisionRadius;

  return (
    position.x > minX &&
    position.x < maxX &&
    position.y > minY &&
    position.y < maxY &&
    position.z > minZ &&
    position.z < maxZ
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
