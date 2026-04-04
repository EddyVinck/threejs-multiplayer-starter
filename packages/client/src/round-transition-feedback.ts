import type { RoomSnapshot } from "@gamejam/shared";

export type RoundTransitionObservationState = {
  lastRoundNumber: number | null;
};

export function createRoundTransitionObservationState(): RoundTransitionObservationState {
  return { lastRoundNumber: null };
}

export function resetRoundTransitionObservation(
  state: RoundTransitionObservationState
): void {
  state.lastRoundNumber = null;
}

/**
 * Call on each authoritative snapshot. First call only records baseline;
 * later calls return true when `round.roundNumber` increases (new round).
 */
export function observeRoundNumberIncrease(
  state: RoundTransitionObservationState,
  snapshot: RoomSnapshot
): boolean {
  const next = snapshot.round.roundNumber;
  const previous = state.lastRoundNumber;
  state.lastRoundNumber = next;

  if (previous === null) {
    return false;
  }

  return next > previous;
}
