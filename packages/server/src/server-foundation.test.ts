import { describe, expect, it } from "vitest";

import {
  createGlobalAuthoritativeTickLoop,
  createServerFoundation,
  type ServerLogger
} from "./server-foundation.js";

const logger: ServerLogger = {
  info() {},
  error() {}
};

describe("server foundation", () => {
  it("ticks all registered room runtimes from the global authoritative loop", () => {
    const loop = createGlobalAuthoritativeTickLoop({
      tickRate: 20,
      logger
    });
    let alphaTicks = 0;
    let bravoTicks = 0;

    loop.registerRoom({
      roomId: "room-alpha",
      step() {
        alphaTicks += 1;
      }
    });
    loop.registerRoom({
      roomId: "room-bravo",
      step() {
        bravoTicks += 1;
      }
    });

    loop.tickOnce();
    loop.tickOnce();
    loop.unregisterRoom("room-bravo");
    loop.tickOnce();

    expect(alphaTicks).toBe(3);
    expect(bravoTicks).toBe(2);
    expect(loop.getTickCount()).toBe(3);
    expect(loop.getRegisteredRoomCount()).toBe(1);
  });

  it("starts an express and socket.io server with a health route", async () => {
    const foundation = createServerFoundation({
      host: "127.0.0.1",
      port: 0,
      tickRate: 30,
      logger
    });

    const address = await foundation.start();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/health`
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.ok).toBe(true);
    expect(foundation.tickLoop.isRunning()).toBe(true);
    expect(body).toMatchObject({
      ok: true,
      package: "@gamejam/server",
      transport: "socket.io",
      tickRate: 30,
      activeRooms: 0
    });

    await foundation.stop();

    expect(foundation.tickLoop.isRunning()).toBe(false);
  });
});
