import { z } from "zod";

import { roomCodeSchema } from "./room-code.js";
import {
  displayNameSchema,
  nonNegativeIntegerSchema,
  playerCommandSchema,
  playerIdSchema,
  roomDeltaSchema,
  roomIdSchema,
  roomSnapshotSchema,
  roomVisibilitySchema,
  sessionModeSchema
} from "./schemas.js";

export const PROTOCOL_VERSION = 1 as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;
export type MessageEnvelope<TType extends string, TPayload> = {
  v: ProtocolVersion;
  type: TType;
  ts: number;
  payload: TPayload;
};

export function createMessageEnvelope<TType extends string, TPayload>(
  type: TType,
  payload: TPayload,
  timestampMs: number = Date.now()
): MessageEnvelope<TType, TPayload> {
  return {
    v: PROTOCOL_VERSION,
    type,
    ts: timestampMs,
    payload
  };
}

export function createMessageEnvelopeSchema<
  TType extends string,
  TPayloadSchema extends z.ZodType
>(type: TType, payloadSchema: TPayloadSchema) {
  return z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal(type),
    ts: nonNegativeIntegerSchema,
    payload: payloadSchema
  });
}

export const clientEventTypes = {
  quickJoinRequested: "session:quick-join-requested",
  roomCreationRequested: "session:create-room-requested",
  roomJoinRequested: "session:join-room-requested",
  playerCommandSubmitted: "room:player-command-submitted"
} as const;

export const serverEventTypes = {
  sessionJoined: "session:joined",
  roomSnapshotPushed: "room:snapshot-pushed",
  roomDeltaPushed: "room:delta-pushed",
  protocolErrored: "protocol:errored"
} as const;

type ValueOf<TObject> = TObject[keyof TObject];

export type ClientEventType = ValueOf<typeof clientEventTypes>;
export type ServerEventType = ValueOf<typeof serverEventTypes>;

const sessionRequestBaseSchema = z.object({
  displayName: displayNameSchema.optional()
});

export const quickJoinRequestSchema = sessionRequestBaseSchema.extend({
  mode: z.literal("multiplayer")
});

export const createRoomRequestSchema = sessionRequestBaseSchema.extend({
  visibility: roomVisibilitySchema.default("private"),
  lateJoinAllowed: z.boolean().default(true)
});

export const joinRoomByCodeRequestSchema = sessionRequestBaseSchema.extend({
  roomCode: roomCodeSchema
});

export const submitPlayerCommandRequestSchema = z.object({
  roomId: roomIdSchema,
  playerId: playerIdSchema,
  command: playerCommandSchema
});

export const sessionJoinedSchema = z.object({
  mode: sessionModeSchema,
  playerId: playerIdSchema,
  roomId: roomIdSchema,
  roomCode: roomCodeSchema,
  visibility: roomVisibilitySchema,
  lateJoin: z.boolean()
});

export const protocolErrorCodeSchema = z.enum([
  "invalid-payload",
  "room-not-found",
  "room-full",
  "not-allowed",
  "internal-error"
]);

export const protocolErrorSchema = z.object({
  code: protocolErrorCodeSchema,
  message: z.string().trim().min(1),
  recoverable: z.boolean()
});

export const quickJoinRequestEnvelopeSchema = createMessageEnvelopeSchema(
  clientEventTypes.quickJoinRequested,
  quickJoinRequestSchema
);

export const createRoomRequestEnvelopeSchema = createMessageEnvelopeSchema(
  clientEventTypes.roomCreationRequested,
  createRoomRequestSchema
);

export const joinRoomByCodeRequestEnvelopeSchema = createMessageEnvelopeSchema(
  clientEventTypes.roomJoinRequested,
  joinRoomByCodeRequestSchema
);

export const submitPlayerCommandRequestEnvelopeSchema =
  createMessageEnvelopeSchema(
    clientEventTypes.playerCommandSubmitted,
    submitPlayerCommandRequestSchema
  );

export const sessionJoinedEnvelopeSchema = createMessageEnvelopeSchema(
  serverEventTypes.sessionJoined,
  sessionJoinedSchema
);

export const roomSnapshotEnvelopeSchema = createMessageEnvelopeSchema(
  serverEventTypes.roomSnapshotPushed,
  roomSnapshotSchema
);

export const roomDeltaEnvelopeSchema = createMessageEnvelopeSchema(
  serverEventTypes.roomDeltaPushed,
  roomDeltaSchema
);

export const protocolErrorEnvelopeSchema = createMessageEnvelopeSchema(
  serverEventTypes.protocolErrored,
  protocolErrorSchema
);

export const clientEnvelopeSchema = z.union([
  quickJoinRequestEnvelopeSchema,
  createRoomRequestEnvelopeSchema,
  joinRoomByCodeRequestEnvelopeSchema,
  submitPlayerCommandRequestEnvelopeSchema
]);

export const serverEnvelopeSchema = z.union([
  sessionJoinedEnvelopeSchema,
  roomSnapshotEnvelopeSchema,
  roomDeltaEnvelopeSchema,
  protocolErrorEnvelopeSchema
]);

export type QuickJoinRequest = z.infer<typeof quickJoinRequestSchema>;
export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;
export type JoinRoomByCodeRequest = z.infer<typeof joinRoomByCodeRequestSchema>;
export type SubmitPlayerCommandRequest = z.infer<
  typeof submitPlayerCommandRequestSchema
>;
export type SessionJoined = z.infer<typeof sessionJoinedSchema>;
export type ProtocolErrorCode = z.infer<typeof protocolErrorCodeSchema>;
export type ProtocolError = z.infer<typeof protocolErrorSchema>;
export type ClientEnvelope = z.infer<typeof clientEnvelopeSchema>;
export type ServerEnvelope = z.infer<typeof serverEnvelopeSchema>;
