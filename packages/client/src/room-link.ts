import type { SessionJoined } from "@gamejam/shared";

export function applySessionRoomLink(
  currentHref: string,
  joined: Pick<SessionJoined, "mode" | "roomCode"> | null
): string {
  const url = new URL(currentHref);

  if (joined !== null && joined.mode === "multiplayer") {
    url.searchParams.set("room", joined.roomCode);
  } else {
    url.searchParams.delete("room");
  }

  url.searchParams.delete("roomCode");
  return url.toString();
}
