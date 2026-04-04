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

export const arenaLayoutSchema = z.object({
  bounds: arenaBoundsSchema,
  playerSpawns: z.array(playerSpawnPointSchema).min(1),
  pickupSpawns: z.array(pickupSpawnPointSchema).min(1)
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
export type ArenaLayout = z.infer<typeof arenaLayoutSchema>;
export type RoundResetState = z.infer<typeof roundResetStateSchema>;
export type RoundTimerState = z.infer<typeof roundTimerStateSchema>;
export type SimulationPlayerState = z.infer<typeof simulationPlayerStateSchema>;
export type SimulationPickupState = z.infer<typeof simulationPickupStateSchema>;
export type AuthoritativeRoomState = z.infer<typeof authoritativeRoomStateSchema>;

export function resolvePlayerVelocity(
  move: {
    x: number;
    y: number;
    z: number;
  },
  speed = DEFAULT_PLAYER_MOVE_SPEED
): Vector3 {
  const normalizedMove = normalizeMovementInput(move);

  return {
    x: normalizedMove.x * speed,
    y: normalizedMove.y * speed,
    z: normalizedMove.z * speed
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
