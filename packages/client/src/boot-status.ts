import type { ProtocolError, RoomSnapshot, SessionJoined } from "@gamejam/shared";

import type { SessionEntryResolution } from "./session-entry.js";

export type BootStatusViewModel = {
  badge: string;
  title: string;
  detail: string;
};

export function describeInitialBootStatus(
  resolution: SessionEntryResolution
): BootStatusViewModel {
  switch (resolution.source) {
    case "room-link":
      return {
        badge: "Invite Link",
        title: `Joining room ${resolution.roomCode}`,
        detail:
          "The canvas and overlay shell are mounted while the shared multiplayer session connects."
      };
    case "invalid-room-link":
      return {
        badge: "Single-player",
        title: "Invalid invite link",
        detail: `Room code "${resolution.invalidRoomCode}" was invalid, so the client fell back to a local session.`
      };
    case "default-single-player":
      return {
        badge: "Single-player",
        title: "Preparing local session",
        detail:
          "The asset-light client shell is ready and waiting for the loopback session."
      };
  }
}

export function describeJoinedStatus(joined: SessionJoined): BootStatusViewModel {
  if (joined.mode === "single-player") {
    return {
      badge: "Single-player",
      title: "Loopback session ready",
      detail: `Local play is running in room ${joined.roomCode}.`
    };
  }

  return {
    badge: joined.visibility === "public" ? "Quick Join" : "Private Room",
    title: `Connected to room ${joined.roomCode}`,
    detail: joined.lateJoin
      ? "Joined an in-progress authoritative room."
      : "Joined before the current round started."
  };
}

export function describeSnapshotStatus(
  snapshot: RoomSnapshot
): BootStatusViewModel {
  const activePickupCount = snapshot.pickups.filter((pickup) => pickup.active).length;
  const remainingSeconds = Math.ceil(snapshot.round.remainingMs / 1000);

  return {
    badge:
      snapshot.mode === "single-player" ? "Local Snapshot" : "Room Snapshot",
    title: `Round ${snapshot.round.roundNumber + 1} with ${snapshot.players.length} player(s)`,
    detail: `${activePickupCount} active pickup(s), ${remainingSeconds}s remaining in room ${snapshot.roomCode}.`
  };
}

export function describeProtocolErrorStatus(
  error: ProtocolError
): BootStatusViewModel {
  return {
    badge: error.recoverable ? "Recoverable Error" : "Session Error",
    title: error.message,
    detail: error.recoverable
      ? "The client can stay mounted while the current session flow recovers."
      : "The current session could not continue."
  };
}

export function describeStoppedStatus(): BootStatusViewModel {
  return {
    badge: "Session Stopped",
    title: "Session stopped",
    detail: "The client shell remains mounted for the next session start."
  };
}

export function describeStartupFailureStatus(
  message: string
): BootStatusViewModel {
  return {
    badge: "Start Failed",
    title: "Unable to start session",
    detail: message
  };
}
