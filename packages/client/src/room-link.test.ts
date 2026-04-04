import { describe, expect, it } from "vitest";

import { applySessionRoomLink } from "./room-link.js";

describe("room link helpers", () => {
  it("writes the authoritative multiplayer room code into the room query param", () => {
    expect(
      applySessionRoomLink("https://gamejam.test/play?debug=1", {
        mode: "multiplayer",
        roomCode: "AB12CD"
      })
    ).toBe("https://gamejam.test/play?debug=1&room=AB12CD");
  });

  it("removes room-link params when the active session is not multiplayer", () => {
    expect(
      applySessionRoomLink(
        "https://gamejam.test/play?room=AB12CD&roomCode=OLD123&debug=1",
        {
          mode: "single-player",
          roomCode: "PLAYER"
        }
      )
    ).toBe("https://gamejam.test/play?debug=1");
  });

  it("clears room-link params when no joined session is available", () => {
    expect(
      applySessionRoomLink(
        "https://gamejam.test/play?room=AB12CD&roomCode=OLD123",
        null
      )
    ).toBe("https://gamejam.test/play");
  });
});
