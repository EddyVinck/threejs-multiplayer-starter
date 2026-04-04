import type {
  PlayerCommand,
  ProtocolError,
  RoomDelta,
  RoomSnapshot,
  SessionJoined
} from "@gamejam/shared";

export type GameSessionEvent =
  | {
      type: "joined";
      joined: SessionJoined;
    }
  | {
      type: "snapshot";
      snapshot: RoomSnapshot;
    }
  | {
      type: "delta";
      delta: RoomDelta;
    }
  | {
      type: "protocol-error";
      error: ProtocolError;
    }
  | {
      type: "stopped";
    };

export type GameSessionListener = (event: GameSessionEvent) => void;

export type GameSessionSubscribeOptions = {
  replayCurrent?: boolean;
};

export type GameSession = {
  getSessionJoined(): SessionJoined | null;
  getLatestSnapshot(): RoomSnapshot | null;
  submitPlayerCommand(command: PlayerCommand): void;
  subscribe(
    listener: GameSessionListener,
    options?: GameSessionSubscribeOptions
  ): () => void;
  stop(): void;
  isStopped(): boolean;
};
