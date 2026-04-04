import type { RoomSnapshot } from "@gamejam/shared";

export type LocalScoreObservationState = {
  lastScore: number | null;
};

export function createLocalScoreObservationState(): LocalScoreObservationState {
  return { lastScore: null };
}

export function resetLocalScoreObservation(
  state: LocalScoreObservationState
): void {
  state.lastScore = null;
}

/**
 * Call on each authoritative snapshot. First call after reset only records the
 * baseline; later calls return true when the local player's score increased
 * (e.g. pickup collected).
 */
export function observeLocalScoreIncrease(
  state: LocalScoreObservationState,
  localPlayerId: string,
  snapshot: RoomSnapshot
): boolean {
  const player = snapshot.players.find((p) => p.playerId === localPlayerId);
  const score = player?.score ?? 0;

  const previous = state.lastScore;
  state.lastScore = score;

  if (previous === null) {
    return false;
  }

  return score > previous;
}
