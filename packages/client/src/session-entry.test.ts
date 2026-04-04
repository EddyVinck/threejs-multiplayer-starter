import { describe, expect, it } from "vitest";

import { resolveInitialSessionEntry } from "./session-entry.js";

describe("session entry", () => {
  it("defaults to single-player when no room link is present", () => {
    expect(resolveInitialSessionEntry("")).toEqual({
      source: "default-single-player",
      request: {
        mode: "single-player"
      }
    });
  });

  it("starts a join-by-code session when a room link is present", () => {
    expect(resolveInitialSessionEntry("?room=ab-2c3d")).toEqual({
      source: "room-link",
      request: {
        mode: "join-by-code",
        roomCode: "AB2C3D"
      },
      roomCode: "AB2C3D"
    });
  });

  it("accepts the roomCode alias for invite links", () => {
    expect(resolveInitialSessionEntry("?roomCode=cd-4e5f")).toEqual({
      source: "room-link",
      request: {
        mode: "join-by-code",
        roomCode: "CD4E5F"
      },
      roomCode: "CD4E5F"
    });
  });

  it("falls back to single-player when a room link is invalid", () => {
    expect(resolveInitialSessionEntry("?room=nope")).toEqual({
      source: "invalid-room-link",
      request: {
        mode: "single-player"
      },
      invalidRoomCode: "nope"
    });
  });
});
