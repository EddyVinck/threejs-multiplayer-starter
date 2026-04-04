import {
  clientEventTypes,
  createMessageEnvelope,
  displayNameSchema,
  protocolErrorEnvelopeSchema,
  roomCodeSchema,
  roomDeltaEnvelopeSchema,
  roomSnapshotEnvelopeSchema,
  serverEventTypes,
  sessionJoinedEnvelopeSchema,
  type PlayerCommand,
  type RoomSnapshot,
  type SessionJoined,
  type RoomVisibility
} from "@gamejam/shared";
import { io as createSocketClient } from "socket.io-client";

import type {
  GameSession,
  GameSessionEvent,
  GameSessionListener,
  GameSessionSubscribeOptions
} from "./session.js";
import { applyRoomDelta, cloneSessionData } from "./session-snapshot.js";

const DEFAULT_DEV_SERVER_URL = "http://127.0.0.1:3001";

export type QuickJoinSessionRequest = {
  mode: "quick-join";
  displayName?: string;
  serverUrl?: string;
};

export type CreateRoomSessionRequest = {
  mode: "create-room";
  displayName?: string;
  visibility?: RoomVisibility;
  lateJoinAllowed?: boolean;
  serverUrl?: string;
};

export type JoinRoomByCodeSessionRequest = {
  mode: "join-by-code";
  roomCode: string;
  displayName?: string;
  serverUrl?: string;
};

export type RemoteSessionStartRequest =
  | QuickJoinSessionRequest
  | CreateRoomSessionRequest
  | JoinRoomByCodeSessionRequest;

type RealtimeSocket = {
  connect(): unknown;
  disconnect(): unknown;
  emit(eventType: string, payload: unknown): boolean;
  off(eventType: string, listener: (payload?: unknown) => void): unknown;
  on(eventType: string, listener: (payload?: unknown) => void): unknown;
  once(eventType: string, listener: (payload?: unknown) => void): unknown;
};

type SocketFactory = (
  serverUrl: string,
  options: {
    autoConnect: boolean;
    transports: string[];
  }
) => RealtimeSocket;

export type RemoteSessionOptions = RemoteSessionStartRequest & {
  signal?: AbortSignal;
  socketFactory?: SocketFactory;
};

export async function startRemoteSession(
  options: RemoteSessionOptions
): Promise<GameSession> {
  if (options.signal?.aborted) {
    throw createAbortError();
  }

  const socketFactory = options.socketFactory ?? createSocketClient;
  const socket = socketFactory(resolveServerUrl(options.serverUrl), {
    autoConnect: false,
    transports: ["websocket"]
  });
  const listeners = new Set<GameSessionListener>();
  let joined: SessionJoined | null = null;
  let latestSnapshot: RoomSnapshot | null = null;
  let stopped = false;
  let settled = false;

  function emit(event: GameSessionEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  function cleanup(): void {
    socket.off("connect", handleConnect);
    socket.off("connect_error", handleConnectError);
    socket.off("disconnect", handleDisconnect);
    socket.off(serverEventTypes.sessionJoined, handleJoined);
    socket.off(serverEventTypes.roomSnapshotPushed, handleSnapshot);
    socket.off(serverEventTypes.roomDeltaPushed, handleDelta);
    socket.off(serverEventTypes.protocolErrored, handleProtocolError);
    options.signal?.removeEventListener("abort", handleAbort);
  }

  function stopInternally(options: { disconnectSocket: boolean }): void {
    if (stopped) {
      return;
    }

    stopped = true;
    cleanup();
    if (options.disconnectSocket) {
      socket.disconnect();
    }
    emit({
      type: "stopped"
    });
  }

  function maybeResolve(
    resolve: (session: GameSession) => void,
    session: GameSession
  ): void {
    if (settled || joined === null || latestSnapshot === null) {
      return;
    }

    settled = true;
    resolve(session);
  }

  function rejectStart(
    reject: (reason?: unknown) => void,
    error: unknown
  ): void {
    if (settled) {
      return;
    }

    settled = true;
    cleanup();
    socket.disconnect();
    reject(error);
  }

  function handleAbort(): void {
    rejectStart(rejectSession, createAbortError());
  }

  function handleConnect(): void {
    const outboundEnvelope = createJoinEnvelope(options);
    socket.emit(outboundEnvelope.eventType, outboundEnvelope.envelope);
  }

  function handleConnectError(error: unknown): void {
    rejectStart(
      rejectSession,
      error instanceof Error ? error : new Error("failed to connect session")
    );
  }

  function handleDisconnect(): void {
    stopInternally({
      disconnectSocket: false
    });
  }

  function handleJoined(envelope: unknown): void {
    joined = sessionJoinedEnvelopeSchema.parse(envelope).payload;
    maybeResolve(resolveSession, session);
  }

  function handleSnapshot(envelope: unknown): void {
    latestSnapshot = roomSnapshotEnvelopeSchema.parse(envelope).payload;
    maybeResolve(resolveSession, session);

    emit({
      type: "snapshot",
      snapshot: cloneSessionData(latestSnapshot)
    });
  }

  function handleDelta(envelope: unknown): void {
    const delta = roomDeltaEnvelopeSchema.parse(envelope).payload;
    if (latestSnapshot !== null) {
      latestSnapshot = applyRoomDelta(latestSnapshot, delta);
    }

    emit({
      type: "delta",
      delta: cloneSessionData(delta)
    });
  }

  function handleProtocolError(envelope: unknown): void {
    const protocolError = protocolErrorEnvelopeSchema.parse(envelope).payload;
    if (!settled) {
      rejectStart(rejectSession, new Error(protocolError.message));
      return;
    }

    emit({
      type: "protocol-error",
      error: cloneSessionData(protocolError)
    });
  }

  const session: GameSession = {
    getSessionJoined() {
      return joined === null ? null : cloneSessionData(joined);
    },

    getLatestSnapshot() {
      return latestSnapshot === null ? null : cloneSessionData(latestSnapshot);
    },

    submitPlayerCommand(command: PlayerCommand) {
      if (stopped) {
        throw new Error("remote session has already been stopped");
      }

      if (joined === null) {
        throw new Error("remote session has not joined a room yet");
      }

      socket.emit(
        clientEventTypes.playerCommandSubmitted,
        createMessageEnvelope(clientEventTypes.playerCommandSubmitted, {
          roomId: joined.roomId,
          playerId: joined.playerId,
          command
        })
      );
    },

    subscribe(
      listener: GameSessionListener,
      subscribeOptions: GameSessionSubscribeOptions = {}
    ) {
      listeners.add(listener);

      if (subscribeOptions.replayCurrent !== false) {
        if (joined !== null) {
          listener({
            type: "joined",
            joined: cloneSessionData(joined)
          });
        }

        if (latestSnapshot !== null) {
          listener({
            type: "snapshot",
            snapshot: cloneSessionData(latestSnapshot)
          });
        }

        if (stopped) {
          listener({
            type: "stopped"
          });
        }
      }

      return () => {
        listeners.delete(listener);
      };
    },

    stop() {
      stopInternally({
        disconnectSocket: true
      });
    },

    isStopped() {
      return stopped;
    }
  };

  let resolveSession: (session: GameSession) => void = () => {};
  let rejectSession: (reason?: unknown) => void = () => {};

  const ready = new Promise<GameSession>((resolve, reject) => {
    resolveSession = resolve;
    rejectSession = reject;
  });

  socket.on("connect", handleConnect);
  socket.on("connect_error", handleConnectError);
  socket.on("disconnect", handleDisconnect);
  socket.on(serverEventTypes.sessionJoined, handleJoined);
  socket.on(serverEventTypes.roomSnapshotPushed, handleSnapshot);
  socket.on(serverEventTypes.roomDeltaPushed, handleDelta);
  socket.on(serverEventTypes.protocolErrored, handleProtocolError);
  options.signal?.addEventListener("abort", handleAbort, {
    once: true
  });

  socket.connect();

  const resolvedSession = await ready;
  return resolvedSession;
}

function createJoinEnvelope(options: RemoteSessionStartRequest): {
  eventType:
    | typeof clientEventTypes.quickJoinRequested
    | typeof clientEventTypes.roomCreationRequested
    | typeof clientEventTypes.roomJoinRequested;
  envelope: ReturnType<typeof createMessageEnvelope>;
} {
  const displayName =
    options.displayName === undefined
      ? undefined
      : displayNameSchema.parse(options.displayName);

  if (options.mode === "quick-join") {
    return {
      eventType: clientEventTypes.quickJoinRequested,
      envelope: createMessageEnvelope(clientEventTypes.quickJoinRequested, {
        mode: "multiplayer",
        ...(displayName === undefined ? {} : { displayName })
      })
    };
  }

  if (options.mode === "create-room") {
    return {
      eventType: clientEventTypes.roomCreationRequested,
      envelope: createMessageEnvelope(clientEventTypes.roomCreationRequested, {
        visibility: options.visibility ?? "private",
        lateJoinAllowed: options.lateJoinAllowed ?? true,
        ...(displayName === undefined ? {} : { displayName })
      })
    };
  }

  return {
    eventType: clientEventTypes.roomJoinRequested,
    envelope: createMessageEnvelope(clientEventTypes.roomJoinRequested, {
      roomCode: roomCodeSchema.parse(options.roomCode),
      ...(displayName === undefined ? {} : { displayName })
    })
  };
}

function createAbortError(): Error {
  const error = new Error("session start was aborted");
  error.name = "AbortError";
  return error;
}

function resolveServerUrl(serverUrl: string | undefined): string {
  if (serverUrl !== undefined) {
    return serverUrl;
  }

  const viteServerUrl =
    typeof import.meta !== "undefined"
      ? import.meta.env?.VITE_SERVER_ORIGIN
      : undefined;
  if (typeof viteServerUrl === "string" && viteServerUrl.length > 0) {
    return viteServerUrl;
  }

  if (
    typeof window !== "undefined" &&
    typeof window.location?.origin === "string" &&
    window.location.origin.length > 0
  ) {
    const isLocalHost =
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "localhost";

    if (isLocalHost && window.location.port === "5173") {
      return `${window.location.protocol}//${window.location.hostname}:3001`;
    }

    return window.location.origin;
  }

  return DEFAULT_DEV_SERVER_URL;
}
