import type { RoomSnapshot, SessionJoined } from "@gamejam/shared";

export type InGameHudViewModel = {
  scoreLine: string;
  timerLine: string;
  roomLine: string;
};

export function buildInGameHudViewModel(
  joined: SessionJoined,
  snapshot: RoomSnapshot | null
): InGameHudViewModel {
  const localScore =
    snapshot === null
      ? null
      : (snapshot.players.find((p) => p.playerId === joined.playerId)?.score ??
        null);

  const scoreLine =
    localScore === null ? "Score: —" : `Score: ${localScore}`;

  let timerLine: string;
  if (snapshot === null) {
    timerLine = "Round: —";
  } else {
    const { phase, remainingMs, roundNumber } = snapshot.round;
    const roundLabel = `Round ${roundNumber + 1}`;
    if (phase === "waiting") {
      timerLine = `${roundLabel} · Waiting`;
    } else if (phase === "resetting") {
      timerLine = `${roundLabel} · Resetting`;
    } else {
      timerLine = `${roundLabel} · ${formatRoundClock(remainingMs)}`;
    }
  }

  const roomLine = describeRoomModeLine(joined);

  return { scoreLine, timerLine, roomLine };
}

function describeRoomModeLine(joined: SessionJoined): string {
  if (joined.mode === "single-player") {
    return `Solo · ${joined.roomCode}`;
  }

  const scope =
    joined.visibility === "public" ? "Public match" : "Private room";
  const late = joined.lateJoin ? " · Mid-round join" : "";
  return `${scope} · ${joined.roomCode}${late}`;
}

function formatRoundClock(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
