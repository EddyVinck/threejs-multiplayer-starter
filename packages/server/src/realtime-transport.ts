import {
  clientEventTypes,
  serverEventTypes,
  type ProtocolErrorCode,
  type RoomDelta,
  type RoomId
} from "@gamejam/shared";
import type { Server as SocketIOServer, Socket } from "socket.io";

import {
  createRoomRuntimeRegistry,
  RoomRuntimeError,
  type RoomRuntimeJoinResult,
  type RoomRuntimeRegistry,
  type RoomRuntimeRegistryOptions
} from "./room-runtime.js";
import type {
  GlobalAuthoritativeTickLoop,
  ServerLogger
} from "./server-foundation.js";
import {
  emitValidatedServerEnvelope,
  parseIncomingClientEnvelope,
  TransportBoundaryValidationError
} from "./transport-boundary.js";

type ConnectedRealtimeSession = {
  socketId: string;
  roomId: RoomId;
  playerId: string;
};

export type RealtimeTransportOptions = {
  io: SocketIOServer;
  tickLoop: GlobalAuthoritativeTickLoop;
  logger?: ServerLogger;
  roomRegistryOptions?: Omit<
    RoomRuntimeRegistryOptions,
    "onRoomStepped" | "tickLoop"
  >;
};

export type RealtimeTransport = {
  readonly roomRegistry: RoomRuntimeRegistry;
  getConnectedSession(socketId: string): ConnectedRealtimeSession | null;
  getConnectedSessionCount(): number;
  stop(): void;
};

function createDefaultLogger(): ServerLogger {
  return console;
}

function withOptionalDisplayName<TRequest extends object>(
  request: TRequest,
  displayName: string | undefined
): TRequest & {
  displayName?: string;
} {
  if (displayName === undefined) {
    return request;
  }

  return {
    ...request,
    displayName
  };
}

function isRecoverableProtocolError(code: ProtocolErrorCode): boolean {
  return code !== "internal-error";
}

function toProtocolErrorPayload(error: unknown): {
  code: ProtocolErrorCode;
  message: string;
  recoverable: boolean;
} {
  if (
    error instanceof TransportBoundaryValidationError ||
    error instanceof RoomRuntimeError
  ) {
    return {
      code: error.code,
      message: error.message,
      recoverable: isRecoverableProtocolError(error.code)
    };
  }

  return {
    code: "internal-error",
    message: "unexpected realtime transport failure",
    recoverable: false
  };
}

export function createRealtimeTransport(
  options: RealtimeTransportOptions
): RealtimeTransport {
  const logger = options.logger ?? createDefaultLogger();
  const sessionsBySocketId = new Map<string, ConnectedRealtimeSession>();
  const roomRegistry = createRoomRuntimeRegistry({
    ...(options.roomRegistryOptions ?? {}),
    tickLoop: options.tickLoop,
    onRoomStepped(room, result) {
      if (result.delta) {
        broadcastRoomDelta(room.roomId, result.delta);
      }
    }
  });

  function emitProtocolError(
    socket: Pick<Socket, "emit">,
    error: unknown
  ): void {
    const protocolError = toProtocolErrorPayload(error);

    emitValidatedServerEnvelope(
      socket,
      serverEventTypes.protocolErrored,
      protocolError
    );

    if (protocolError.code === "internal-error") {
      logger.error("realtime transport emitted an internal protocol error", error);
    }
  }

  function getConnectedSession(socketId: string): ConnectedRealtimeSession | null {
    const session = sessionsBySocketId.get(socketId);
    if (!session) {
      return null;
    }

    return {
      ...session
    };
  }

  function clearSocketSession(
    socket: Pick<Socket, "id" | "leave">,
    reason: "disconnect" | "leave"
  ): void {
    const currentSession = sessionsBySocketId.get(socket.id);
    if (!currentSession) {
      return;
    }

    sessionsBySocketId.delete(socket.id);
    socket.leave(currentSession.roomId);

    try {
      if (reason === "disconnect") {
        roomRegistry.disconnectPlayer(
          currentSession.roomId,
          currentSession.playerId
        );
      } else {
        roomRegistry.leaveRoom(currentSession.roomId, currentSession.playerId);
      }
    } catch (error) {
      logger.error("failed to clear socket session", error);
    }
  }

  function attachJoinedSession(
    socket: Pick<Socket, "id" | "join" | "leave" | "emit">,
    joined: RoomRuntimeJoinResult
  ): void {
    clearSocketSession(socket, "leave");
    socket.join(joined.roomId);

    sessionsBySocketId.set(socket.id, {
      socketId: socket.id,
      roomId: joined.roomId,
      playerId: joined.playerId
    });

    emitValidatedServerEnvelope(socket, serverEventTypes.sessionJoined, {
      mode: "multiplayer",
      playerId: joined.playerId,
      roomId: joined.roomId,
      roomCode: joined.roomCode,
      visibility: joined.visibility,
      lateJoin: joined.lateJoin
    });
    emitValidatedServerEnvelope(
      socket,
      serverEventTypes.roomSnapshotPushed,
      joined.snapshot
    );
  }

  function handleJoinRequest(
    socket: Pick<Socket, "id" | "join" | "leave" | "emit">,
    eventType:
      | typeof clientEventTypes.quickJoinRequested
      | typeof clientEventTypes.roomCreationRequested
      | typeof clientEventTypes.roomJoinRequested,
    envelope: unknown
  ): void {
    try {
      if (eventType === clientEventTypes.quickJoinRequested) {
        const validatedEnvelope = parseIncomingClientEnvelope(eventType, envelope);
        attachJoinedSession(
          socket,
          roomRegistry.quickJoin(
            withOptionalDisplayName(
              {},
              validatedEnvelope.payload.displayName
            )
          )
        );
        return;
      }

      if (eventType === clientEventTypes.roomCreationRequested) {
        const validatedEnvelope = parseIncomingClientEnvelope(eventType, envelope);
        attachJoinedSession(
          socket,
          roomRegistry.createRoom(
            withOptionalDisplayName(
              {
                visibility: validatedEnvelope.payload.visibility,
                lateJoinAllowed: validatedEnvelope.payload.lateJoinAllowed
              },
              validatedEnvelope.payload.displayName
            )
          )
        );
        return;
      }

      const validatedEnvelope = parseIncomingClientEnvelope(eventType, envelope);
      attachJoinedSession(
        socket,
        roomRegistry.joinRoomByCode(
          withOptionalDisplayName(
            {
              roomCode: validatedEnvelope.payload.roomCode
            },
            validatedEnvelope.payload.displayName
          )
        )
      );
    } catch (error) {
      emitProtocolError(socket, error);
    }
  }

  function handleCommandSubmission(
    socket: Pick<Socket, "id" | "emit">,
    envelope: unknown
  ): void {
    try {
      const validatedEnvelope = parseIncomingClientEnvelope(
        clientEventTypes.playerCommandSubmitted,
        envelope
      );
      const session = sessionsBySocketId.get(socket.id);
      if (!session) {
        throw new RoomRuntimeError(
          "not-allowed",
          "join a room before submitting player commands"
        );
      }

      if (
        session.roomId !== validatedEnvelope.payload.roomId ||
        session.playerId !== validatedEnvelope.payload.playerId
      ) {
        throw new TransportBoundaryValidationError(
          "invalid-payload",
          clientEventTypes.playerCommandSubmitted,
          "submitted player command does not match the active socket session"
        );
      }

      roomRegistry.submitPlayerCommand(
        validatedEnvelope.payload.roomId,
        validatedEnvelope.payload.playerId,
        validatedEnvelope.payload.command
      );
    } catch (error) {
      emitProtocolError(socket, error);
    }
  }

  function broadcastRoomDelta(roomId: RoomId, delta: RoomDelta): void {
    emitValidatedServerEnvelope(
      options.io.to(roomId),
      serverEventTypes.roomDeltaPushed,
      delta
    );
  }

  function handleSocketConnection(socket: Socket): void {
    logger.info(`socket connected ${socket.id}`);

    socket.on(clientEventTypes.quickJoinRequested, (envelope) => {
      handleJoinRequest(socket, clientEventTypes.quickJoinRequested, envelope);
    });
    socket.on(clientEventTypes.roomCreationRequested, (envelope) => {
      handleJoinRequest(socket, clientEventTypes.roomCreationRequested, envelope);
    });
    socket.on(clientEventTypes.roomJoinRequested, (envelope) => {
      handleJoinRequest(socket, clientEventTypes.roomJoinRequested, envelope);
    });
    socket.on(clientEventTypes.playerCommandSubmitted, (envelope) => {
      handleCommandSubmission(socket, envelope);
    });
    socket.on("disconnect", () => {
      logger.info(`socket disconnected ${socket.id}`);
      clearSocketSession(socket, "disconnect");
    });
  }

  options.io.on("connection", handleSocketConnection);

  return {
    roomRegistry,

    getConnectedSession,

    getConnectedSessionCount() {
      return sessionsBySocketId.size;
    },

    stop() {
      options.io.off("connection", handleSocketConnection);
      sessionsBySocketId.clear();
    }
  };
}
