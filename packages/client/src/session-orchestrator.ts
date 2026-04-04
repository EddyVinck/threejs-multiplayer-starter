import type { GameSession } from "./session.js";
import {
  startRemoteSession,
  type CreateRoomSessionRequest,
  type JoinRoomByCodeSessionRequest,
  type QuickJoinSessionRequest,
  type RemoteSessionOptions
} from "./remote-session.js";
import { createLoopbackSession } from "./loopback-session.js";

export type SinglePlayerSessionRequest = {
  mode: "single-player";
  displayName?: string;
};

export type SessionStartRequest =
  | SinglePlayerSessionRequest
  | QuickJoinSessionRequest
  | CreateRoomSessionRequest
  | JoinRoomByCodeSessionRequest;

export type SessionOrchestrator = {
  getCurrentSession(): GameSession | null;
  startSession(request: SessionStartRequest): Promise<GameSession>;
  stopSession(): void;
};

export type SessionOrchestratorOptions = {
  startLoopbackSession?: (request: SinglePlayerSessionRequest) => GameSession;
  startRemoteSession?: (request: RemoteSessionOptions) => Promise<GameSession>;
};

export function createSessionOrchestrator(
  options: SessionOrchestratorOptions = {}
): SessionOrchestrator {
  const startLoopbackSession =
    options.startLoopbackSession ?? defaultStartLoopbackSession;
  const startRemoteSessionImpl =
    options.startRemoteSession ?? defaultStartRemoteSession;
  let currentSession: GameSession | null = null;
  let activeStartToken = 0;
  let pendingAbortController: AbortController | null = null;

  return {
    getCurrentSession() {
      return currentSession;
    },

    async startSession(request) {
      const startToken = activeStartToken + 1;
      activeStartToken = startToken;
      pendingAbortController?.abort();

      const previousSession = currentSession;
      const abortController = new AbortController();
      pendingAbortController = abortController;

      try {
        const nextSession =
          request.mode === "single-player"
            ? startLoopbackSession(request)
            : await startRemoteSessionImpl({
                ...request,
                signal: abortController.signal
              });

        if (abortController.signal.aborted || startToken !== activeStartToken) {
          nextSession.stop();
          throw createAbortError();
        }

        currentSession = nextSession;
        if (pendingAbortController === abortController) {
          pendingAbortController = null;
        }

        if (previousSession !== null && previousSession !== nextSession) {
          previousSession.stop();
        }

        return nextSession;
      } catch (error) {
        if (pendingAbortController === abortController) {
          pendingAbortController = null;
        }

        throw error;
      }
    },

    stopSession() {
      pendingAbortController?.abort();
      pendingAbortController = null;

      if (currentSession !== null) {
        currentSession.stop();
        currentSession = null;
      }

      activeStartToken += 1;
    }
  };
}

function defaultStartLoopbackSession(
  request: SinglePlayerSessionRequest
): GameSession {
  return createLoopbackSession({
    ...(request.displayName === undefined
      ? {}
      : { displayName: request.displayName })
  });
}

async function defaultStartRemoteSession(
  request: RemoteSessionOptions
): Promise<GameSession> {
  return startRemoteSession(request);
}

function createAbortError(): Error {
  const error = new Error("session start was superseded");
  error.name = "AbortError";
  return error;
}
