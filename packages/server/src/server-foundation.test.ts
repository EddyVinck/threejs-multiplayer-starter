import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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

  it("serves a built client directory and falls back to index.html for unknown GET paths", async () => {
    const staticRoot = mkdtempSync(path.join(tmpdir(), "gamejam-client-"));
    writeFileSync(path.join(staticRoot, "index.html"), "<!doctype html><title>jam</title>");
    writeFileSync(path.join(staticRoot, "asset.txt"), "ok");

    const foundation = createServerFoundation({
      host: "127.0.0.1",
      port: 0,
      tickRate: 30,
      logger,
      clientStaticRoot: staticRoot
    });

    const address = await foundation.start();
    const base = `http://127.0.0.1:${address.port}`;

    const healthResponse = await fetch(`${base}/health`);
    expect(healthResponse.ok).toBe(true);

    const indexResponse = await fetch(`${base}/`);
    expect(indexResponse.ok).toBe(true);
    expect(await indexResponse.text()).toContain("jam");

    const assetResponse = await fetch(`${base}/asset.txt`);
    expect(assetResponse.ok).toBe(true);
    expect(await assetResponse.text()).toBe("ok");

    const spaResponse = await fetch(`${base}/room/foo`);
    expect(spaResponse.ok).toBe(true);
    expect(await spaResponse.text()).toContain("jam");

    await foundation.stop();
  });
});
