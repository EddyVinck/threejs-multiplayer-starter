import { z } from "zod";

import { roomCodeSchema } from "./room-code.js";

export const DISPLAY_NAME_MAX_LENGTH = 24;

export const finiteNumberSchema = z.number().finite();
export const nonNegativeIntegerSchema = z.number().int().nonnegative();

export const playerIdSchema = z.string().min(1).max(64);
export const roomIdSchema = z.string().min(1).max(64);
export const entityIdSchema = z.string().min(1).max(64);

export const displayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(DISPLAY_NAME_MAX_LENGTH);

export const sessionModeSchema = z.enum(["single-player", "multiplayer"]);
export const roomVisibilitySchema = z.enum(["public", "private"]);
export const roundPhaseSchema = z.enum(["waiting", "active", "resetting"]);

export const vector3Schema = z.object({
  x: finiteNumberSchema,
  y: finiteNumberSchema,
  z: finiteNumberSchema
});

export const inputAxisSchema = z.number().min(-1).max(1);

export const inputVectorSchema = z.object({
  x: inputAxisSchema,
  y: inputAxisSchema,
  z: inputAxisSchema
});

export const lookInputSchema = z.object({
  yaw: finiteNumberSchema,
  pitch: finiteNumberSchema
});

export const actionButtonsSchema = z.object({
  jump: z.boolean(),
  primary: z.boolean(),
  secondary: z.boolean()
});

export const playerCommandSchema = z.object({
  sequence: nonNegativeIntegerSchema,
  deltaMs: nonNegativeIntegerSchema,
  move: inputVectorSchema,
  look: lookInputSchema,
  actions: actionButtonsSchema
});

export const playerSnapshotSchema = z.object({
  playerId: playerIdSchema,
  displayName: displayNameSchema,
  position: vector3Schema,
  velocity: vector3Schema,
  yaw: finiteNumberSchema,
  score: nonNegativeIntegerSchema,
  connected: z.boolean()
});

export const pickupSnapshotSchema = z.object({
  pickupId: entityIdSchema,
  position: vector3Schema,
  active: z.boolean(),
  respawnAtTick: nonNegativeIntegerSchema.nullable()
});

export const roundStateSchema = z.object({
  phase: roundPhaseSchema,
  roundNumber: nonNegativeIntegerSchema,
  remainingMs: nonNegativeIntegerSchema
});

export const roomSnapshotSchema = z.object({
  roomId: roomIdSchema,
  roomCode: roomCodeSchema,
  mode: sessionModeSchema,
  visibility: roomVisibilitySchema,
  lateJoinAllowed: z.boolean(),
  serverTick: nonNegativeIntegerSchema,
  round: roundStateSchema,
  players: z.array(playerSnapshotSchema),
  pickups: z.array(pickupSnapshotSchema)
});

export const roomDeltaSchema = z.object({
  roomId: roomIdSchema,
  roomCode: roomCodeSchema,
  serverTick: nonNegativeIntegerSchema,
  round: roundStateSchema.optional(),
  updatedPlayers: z.array(playerSnapshotSchema),
  updatedPickups: z.array(pickupSnapshotSchema),
  removedPickupIds: z.array(entityIdSchema)
});

export type PlayerId = z.infer<typeof playerIdSchema>;
export type RoomId = z.infer<typeof roomIdSchema>;
export type EntityId = z.infer<typeof entityIdSchema>;
export type DisplayName = z.infer<typeof displayNameSchema>;
export type SessionMode = z.infer<typeof sessionModeSchema>;
export type RoomVisibility = z.infer<typeof roomVisibilitySchema>;
export type RoundPhase = z.infer<typeof roundPhaseSchema>;
export type Vector3 = z.infer<typeof vector3Schema>;
export type InputVector = z.infer<typeof inputVectorSchema>;
export type LookInput = z.infer<typeof lookInputSchema>;
export type ActionButtons = z.infer<typeof actionButtonsSchema>;
export type PlayerCommand = z.infer<typeof playerCommandSchema>;
export type PlayerSnapshot = z.infer<typeof playerSnapshotSchema>;
export type PickupSnapshot = z.infer<typeof pickupSnapshotSchema>;
export type RoundState = z.infer<typeof roundStateSchema>;
export type RoomSnapshot = z.infer<typeof roomSnapshotSchema>;
export type RoomDelta = z.infer<typeof roomDeltaSchema>;

export { roomCodeSchema };
