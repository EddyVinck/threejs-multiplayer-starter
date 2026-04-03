import {
  clientEventTypes,
  createMessageEnvelope,
  createRoomRequestEnvelopeSchema,
  joinRoomByCodeRequestEnvelopeSchema,
  protocolErrorEnvelopeSchema,
  quickJoinRequestEnvelopeSchema,
  roomDeltaEnvelopeSchema,
  roomSnapshotEnvelopeSchema,
  serverEventTypes,
  sessionJoinedEnvelopeSchema,
  submitPlayerCommandRequestEnvelopeSchema,
  type ClientEventType,
  type ProtocolErrorCode,
  type ServerEventType
} from "@gamejam/shared";
import { ZodError, type ZodType } from "zod";

type InferSchema<TSchema extends ZodType> =
  TSchema extends ZodType<infer TOutput> ? TOutput : never;
type EnvelopePayload<TEnvelope> = TEnvelope extends { payload: infer TPayload }
  ? TPayload
  : never;

const clientEnvelopeSchemas = {
  [clientEventTypes.quickJoinRequested]: quickJoinRequestEnvelopeSchema,
  [clientEventTypes.roomCreationRequested]: createRoomRequestEnvelopeSchema,
  [clientEventTypes.roomJoinRequested]: joinRoomByCodeRequestEnvelopeSchema,
  [clientEventTypes.playerCommandSubmitted]: submitPlayerCommandRequestEnvelopeSchema
} as const satisfies Record<ClientEventType, ZodType>;

const serverEnvelopeSchemas = {
  [serverEventTypes.sessionJoined]: sessionJoinedEnvelopeSchema,
  [serverEventTypes.roomSnapshotPushed]: roomSnapshotEnvelopeSchema,
  [serverEventTypes.roomDeltaPushed]: roomDeltaEnvelopeSchema,
  [serverEventTypes.protocolErrored]: protocolErrorEnvelopeSchema
} as const satisfies Record<ServerEventType, ZodType>;

export type ValidatedClientEnvelope<TType extends ClientEventType> = InferSchema<
  (typeof clientEnvelopeSchemas)[TType]
>;

export type ValidatedServerEnvelope<TType extends ServerEventType> = InferSchema<
  (typeof serverEnvelopeSchemas)[TType]
>;

export type TransportEnvelopeEmitter = {
  emit(event: string, envelope: unknown): boolean | void;
};

export class TransportBoundaryValidationError extends Error {
  readonly code: ProtocolErrorCode;
  readonly eventType: ClientEventType | ServerEventType;
  override readonly cause: unknown;

  constructor(
    code: ProtocolErrorCode,
    eventType: ClientEventType | ServerEventType,
    message: string,
    cause?: unknown
  ) {
    super(message);
    this.name = "TransportBoundaryValidationError";
    this.code = code;
    this.eventType = eventType;
    this.cause = cause;
  }
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "envelope";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function parseEnvelope<
  TType extends ClientEventType | ServerEventType,
  TSchema extends ZodType
>(
  schema: TSchema,
  eventType: TType,
  envelope: unknown,
  code: ProtocolErrorCode,
  direction: "incoming" | "outgoing"
): InferSchema<TSchema> {
  const parsed = schema.safeParse(envelope);
  if (parsed.success) {
    return parsed.data as InferSchema<TSchema>;
  }

  throw new TransportBoundaryValidationError(
    code,
    eventType,
    `invalid ${direction} ${eventType} envelope: ${formatZodError(parsed.error)}`,
    parsed.error
  );
}

export function parseIncomingClientEnvelope<TType extends ClientEventType>(
  eventType: TType,
  envelope: unknown
): ValidatedClientEnvelope<TType> {
  return parseEnvelope(
    clientEnvelopeSchemas[eventType],
    eventType,
    envelope,
    "invalid-payload",
    "incoming"
  ) as ValidatedClientEnvelope<TType>;
}

export function validateOutgoingServerEnvelope<TType extends ServerEventType>(
  eventType: TType,
  envelope: unknown
): ValidatedServerEnvelope<TType> {
  return parseEnvelope(
    serverEnvelopeSchemas[eventType],
    eventType,
    envelope,
    "internal-error",
    "outgoing"
  ) as ValidatedServerEnvelope<TType>;
}

export function emitValidatedServerEnvelope<TType extends ServerEventType>(
  emitter: TransportEnvelopeEmitter,
  eventType: TType,
  payload: EnvelopePayload<ValidatedServerEnvelope<TType>>,
  timestampMs?: number
): ValidatedServerEnvelope<TType> {
  const envelope = validateOutgoingServerEnvelope(
    eventType,
    createMessageEnvelope(eventType, payload, timestampMs)
  );

  emitter.emit(eventType, envelope);
  return envelope;
}
