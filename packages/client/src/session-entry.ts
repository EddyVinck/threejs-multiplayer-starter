import { roomCodeSchema } from "@gamejam/shared";

import type { SessionStartRequest } from "./session-orchestrator.js";

const ROOM_LINK_QUERY_KEYS = ["room", "roomCode"] as const;

export type SessionEntryResolution =
  | {
      source: "default-single-player";
      request: SessionStartRequest;
    }
  | {
      source: "room-link";
      request: SessionStartRequest;
      roomCode: string;
    }
  | {
      source: "invalid-room-link";
      request: SessionStartRequest;
      invalidRoomCode: string;
    };

export function resolveInitialSessionEntry(
  search: string
): SessionEntryResolution {
  const linkedRoomCode = readLinkedRoomCode(search);
  if (linkedRoomCode === null) {
    return {
      source: "default-single-player",
      request: { mode: "single-player" }
    };
  }

  const parsedRoomCode = roomCodeSchema.safeParse(linkedRoomCode);
  if (!parsedRoomCode.success) {
    return {
      source: "invalid-room-link",
      request: { mode: "single-player" },
      invalidRoomCode: linkedRoomCode
    };
  }

  return {
    source: "room-link",
    request: {
      mode: "join-by-code",
      roomCode: parsedRoomCode.data
    },
    roomCode: parsedRoomCode.data
  };
}

function readLinkedRoomCode(search: string): string | null {
  const searchParams = new URLSearchParams(search);

  for (const key of ROOM_LINK_QUERY_KEYS) {
    const values = searchParams.getAll(key);
    if (values.length === 0) {
      continue;
    }

    return values[0] ?? "";
  }

  return null;
}
