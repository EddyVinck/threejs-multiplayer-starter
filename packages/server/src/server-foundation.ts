import express, { type Express } from "express";
import { createServer, type Server as HttpServer } from "node:http";

import {
  defaultSimulationRules,
  type RoomId
} from "@gamejam/shared";
import {
  Server as SocketIOServer,
  type ServerOptions as SocketIOServerOptions
} from "socket.io";

export type AuthoritativeRoomRuntime = {
  roomId: RoomId;
  step(): void;
};

export type ServerLogger = {
  info(message: string): void;
  error(message: string, error?: unknown): void;
};

export type GlobalAuthoritativeTickLoop = {
  registerRoom(runtime: AuthoritativeRoomRuntime): void;
  unregisterRoom(roomId: RoomId): boolean;
  tickOnce(): void;
  start(): void;
  stop(): void;
  isRunning(): boolean;
  getTickCount(): number;
  getTickRate(): number;
  getRegisteredRoomCount(): number;
};

export type GlobalAuthoritativeTickLoopOptions = {
  tickRate?: number;
  logger?: ServerLogger;
};

export type ServerFoundationOptions = {
  port?: number;
  host?: string;
  tickRate?: number;
  logger?: ServerLogger;
  socketServerOptions?: Partial<SocketIOServerOptions>;
};

export type ServerFoundationAddress = {
  host: string;
  port: number;
};

export type ServerFoundation = {
  app: Express;
  httpServer: HttpServer;
  io: SocketIOServer;
  tickLoop: GlobalAuthoritativeTickLoop;
  start(): Promise<ServerFoundationAddress>;
  stop(): Promise<void>;
};

const DEFAULT_HOST = "127.0.0.1";

function createDefaultLogger(): ServerLogger {
  return console;
}

function getServerAddress(
  httpServer: HttpServer,
  fallbackHost: string
): ServerFoundationAddress {
  const address = httpServer.address();

  if (!address || typeof address === "string") {
    return {
      host: fallbackHost,
      port: 0
    };
  }

  return {
    host: address.address,
    port: address.port
  };
}

function closeSocketServer(io: SocketIOServer): Promise<void> {
  return new Promise((resolve) => {
    io.close(() => {
      resolve();
    });
  });
}

function closeHttpServer(httpServer: HttpServer): Promise<void> {
  if (!httpServer.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function createGlobalAuthoritativeTickLoop(
  options: GlobalAuthoritativeTickLoopOptions = {}
): GlobalAuthoritativeTickLoop {
  const logger = options.logger ?? createDefaultLogger();
  const tickRate = options.tickRate ?? defaultSimulationRules.tickRate;
  const tickIntervalMs = Math.max(1, Math.round(1000 / tickRate));
  const runtimes = new Map<RoomId, AuthoritativeRoomRuntime>();
  let timer: NodeJS.Timeout | null = null;
  let tickCount = 0;

  function tickOnce(): void {
    tickCount += 1;

    for (const runtime of runtimes.values()) {
      try {
        runtime.step();
      } catch (error) {
        logger.error(
          `authoritative tick failed for room ${runtime.roomId}`,
          error
        );
      }
    }
  }

  return {
    registerRoom(runtime) {
      runtimes.set(runtime.roomId, runtime);
    },

    unregisterRoom(roomId) {
      return runtimes.delete(roomId);
    },

    tickOnce,

    start() {
      if (timer) {
        return;
      }

      timer = setInterval(tickOnce, tickIntervalMs);
    },

    stop() {
      if (!timer) {
        return;
      }

      clearInterval(timer);
      timer = null;
    },

    isRunning() {
      return timer !== null;
    },

    getTickCount() {
      return tickCount;
    },

    getTickRate() {
      return tickRate;
    },

    getRegisteredRoomCount() {
      return runtimes.size;
    }
  };
}

export function createServerFoundation(
  options: ServerFoundationOptions = {}
): ServerFoundation {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? 3001;
  const logger = options.logger ?? createDefaultLogger();
  const tickLoop = createGlobalAuthoritativeTickLoop({
    ...(options.tickRate === undefined ? {} : { tickRate: options.tickRate }),
    logger
  });

  const app = express();
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      package: "@gamejam/server",
      transport: "socket.io",
      tickRate: tickLoop.getTickRate(),
      activeRooms: tickLoop.getRegisteredRoomCount()
    });
  });

  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true
    },
    ...options.socketServerOptions
  });

  return {
    app,
    httpServer,
    io,
    tickLoop,

    async start() {
      if (httpServer.listening) {
        return getServerAddress(httpServer, host);
      }

      await new Promise<void>((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(
          {
            host,
            port
          },
          () => {
            httpServer.off("error", reject);
            resolve();
          }
        );
      });

      tickLoop.start();
      return getServerAddress(httpServer, host);
    },

    async stop() {
      tickLoop.stop();
      await closeSocketServer(io);
      await closeHttpServer(httpServer);
    }
  };
}
