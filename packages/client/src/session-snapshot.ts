import type { RoomDelta, RoomSnapshot } from "@gamejam/shared";

export function cloneSessionData<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

export function applyRoomDelta(
  snapshot: RoomSnapshot,
  delta: RoomDelta
): RoomSnapshot {
  const playersById = new Map(
    snapshot.players.map((player) => [player.playerId, player] as const)
  );
  const pickupsById = new Map(
    snapshot.pickups.map((pickup) => [pickup.pickupId, pickup] as const)
  );

  for (const playerId of delta.removedPlayerIds) {
    playersById.delete(playerId);
  }

  for (const player of delta.updatedPlayers) {
    playersById.set(player.playerId, player);
  }

  for (const pickupId of delta.removedPickupIds) {
    pickupsById.delete(pickupId);
  }

  for (const pickup of delta.updatedPickups) {
    pickupsById.set(pickup.pickupId, pickup);
  }

  return {
    roomId: snapshot.roomId,
    roomCode: snapshot.roomCode,
    mode: snapshot.mode,
    visibility: snapshot.visibility,
    lateJoinAllowed: snapshot.lateJoinAllowed,
    serverTick: delta.serverTick,
    round: delta.round ?? snapshot.round,
    players: [...playersById.values()],
    pickups: [...pickupsById.values()]
  };
}
