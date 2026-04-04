import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defaultSimulationRules } from "@gamejam/shared";

import { createRealtimeTransport } from "./realtime-transport.js";
import { createServerFoundation } from "./server-foundation.js";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";

const clientDist = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../client/dist"
);
const serveClientStatic =
  process.env.NODE_ENV === "production" && existsSync(clientDist);

const foundation = createServerFoundation({
  host,
  port,
  tickRate: defaultSimulationRules.tickRate,
  ...(serveClientStatic ? { clientStaticRoot: clientDist } : {})
});
createRealtimeTransport({
  io: foundation.io,
  tickLoop: foundation.tickLoop
});

async function main(): Promise<void> {
  const address = await foundation.start();
  console.log(`server listening on http://${address.host}:${address.port}`);
}

async function shutdown(): Promise<void> {
  await foundation.stop();
}

process.once("SIGINT", () => {
  void shutdown();
});

process.once("SIGTERM", () => {
  void shutdown();
});

void main().catch(async (error: unknown) => {
  console.error("failed to start server", error);
  await shutdown();
  process.exitCode = 1;
});
