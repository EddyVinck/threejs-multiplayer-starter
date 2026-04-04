import "./styles.css";

import {
  describeJoinedStatus,
  describeProtocolErrorStatus,
  describeSessionStartingStatus,
  describeSnapshotStatus,
  describeStartupFailureStatus,
  describeStoppedStatus
} from "./boot-status.js";
import { mountClientBootShell } from "./boot-shell.js";
import { createClientSettingsStore } from "./persistence.js";
import { createPlayerCommandPipeline } from "./player-command-pipeline.js";
import { createRenderSceneAdapter } from "./render-scene-adapter.js";
import { applySessionRoomLink } from "./room-link.js";
import { createSessionOrchestrator } from "./session-orchestrator.js";
import { resolveInitialSessionEntry } from "./session-entry.js";
import type { SessionStartRequest } from "./session-orchestrator.js";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Expected #app root element");
}

const orchestrator = createSessionOrchestrator();
const settingsStore = createClientSettingsStore();
const initialSessionEntry = resolveInitialSessionEntry(window.location.search);
const initialSessionRequest = applyPersistedDisplayName(
  initialSessionEntry.request,
  settingsStore.getSettings().displayName
);
const bootShell = mountClientBootShell({
  appRoot: app,
  resolution: initialSessionEntry,
  onStartSession: (request) => {
    void startSession(request);
  }
});
let stopCommandPipeline: (() => void) | null = null;
let renderSceneAdapter: ReturnType<typeof createRenderSceneAdapter> | null = null;
let unsubscribeFromSession: (() => void) | null = null;

if (initialSessionEntry.source === "room-link") {
  void startSession(initialSessionRequest, {
    autoStarted: true
  });
}

async function startSession(
  request: SessionStartRequest,
  options: {
    autoStarted?: boolean;
  } = {}
): Promise<void> {
  const hydratedRequest = applyPersistedDisplayName(
    request,
    settingsStore.getSettings().displayName
  );

  bootShell.setPendingSessionStart(hydratedRequest.mode);
  bootShell.setStatus(describeSessionStartingStatus(hydratedRequest));
  bootShell.setPreGameVisible(false);
  unsubscribeFromSession?.();
  unsubscribeFromSession = null;

  try {
    const session = await orchestrator.startSession(hydratedRequest);

    renderSceneAdapter?.dispose();
    renderSceneAdapter = createRenderSceneAdapter({
      canvas: bootShell.canvas
    });

    stopCommandPipeline?.();
    stopCommandPipeline = attachPlayerCommandPipeline({
      canvas: bootShell.canvas,
      submitCommand: (command) => {
        renderSceneAdapter?.submitPlayerCommand(command);
        session.submitPlayerCommand(command);
      }
    });

    const joinedSession = session.getSessionJoined();
    if (joinedSession !== null) {
      syncRoomLink(joinedSession);
      renderSceneAdapter.syncSessionJoined(joinedSession);
      bootShell.setStatus(describeJoinedStatus(joinedSession));
    }

    const latestSnapshot = session.getLatestSnapshot();
    if (latestSnapshot !== null) {
      renderSceneAdapter.syncAuthoritativeSnapshot(latestSnapshot);
      bootShell.setStatus(describeSnapshotStatus(latestSnapshot));
    }

    renderSceneAdapter.start();
    bootShell.setPendingSessionStart(null);
    bootShell.setPreGameVisible(false);

    unsubscribeFromSession = session.subscribe((event) => {
      if (event.type === "joined") {
        syncRoomLink(event.joined);
        renderSceneAdapter?.syncSessionJoined(event.joined);
        bootShell.setStatus(describeJoinedStatus(event.joined));
        return;
      }

      if (event.type === "snapshot") {
        renderSceneAdapter?.syncAuthoritativeSnapshot(event.snapshot);
        bootShell.setStatus(describeSnapshotStatus(event.snapshot));
        return;
      }

      if (event.type === "delta") {
        const updatedSnapshot = session.getLatestSnapshot();
        if (updatedSnapshot !== null) {
          renderSceneAdapter?.syncAuthoritativeSnapshot(updatedSnapshot);
          bootShell.setStatus(describeSnapshotStatus(updatedSnapshot));
        }
        return;
      }

      if (event.type === "protocol-error") {
        bootShell.setStatus(describeProtocolErrorStatus(event.error));
        return;
      }

      if (event.type === "stopped") {
        stopCommandPipeline?.();
        stopCommandPipeline = null;
        renderSceneAdapter?.stop();
        bootShell.setPendingSessionStart(null);
        bootShell.setPreGameVisible(true);
        bootShell.setStatus(describeStoppedStatus());
      }
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return;
    }

    stopCommandPipeline?.();
    stopCommandPipeline = null;
    renderSceneAdapter?.dispose();
    renderSceneAdapter = null;
    bootShell.setPendingSessionStart(null);
    bootShell.setPreGameVisible(true);
    const message =
      error instanceof Error ? error.message : "failed to start session";
    bootShell.setStatus(describeStartupFailureStatus(message));

    if (options.autoStarted) {
      return;
    }
  }
}

function applyPersistedDisplayName(
  request: SessionStartRequest,
  displayName: string | null
): SessionStartRequest {
  if (displayName === null) {
    return request;
  }

  return {
    ...request,
    displayName
  };
}

function attachPlayerCommandPipeline(options: {
  canvas: HTMLCanvasElement;
  submitCommand: Parameters<
    typeof createPlayerCommandPipeline
  >[0]["submitCommand"];
}): () => void {
  const pipeline = createPlayerCommandPipeline({
    captureElement: options.canvas,
    submitCommand: options.submitCommand
  });

  pipeline.start();

  return () => {
    pipeline.stop();
  };
}

function syncRoomLink(joined: Parameters<typeof applySessionRoomLink>[1]): void {
  if (
    typeof window === "undefined" ||
    typeof window.location?.href !== "string" ||
    typeof window.history?.replaceState !== "function"
  ) {
    return;
  }

  const nextHref = applySessionRoomLink(window.location.href, joined);
  if (nextHref !== window.location.href) {
    window.history.replaceState(window.history.state, "", nextHref);
  }
}
