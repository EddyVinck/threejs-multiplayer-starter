import { defaultSimulationRules } from "@gamejam/shared";

import { createServerFoundation } from "./server-foundation.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

const foundation = createServerFoundation({
  host,
  port,
  tickRate: defaultSimulationRules.tickRate
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
