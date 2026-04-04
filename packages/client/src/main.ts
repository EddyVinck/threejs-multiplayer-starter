import "./styles.css";

import {
  describeJoinedStatus,
  describeProtocolErrorStatus,
  describeSnapshotStatus,
  describeStartupFailureStatus,
  describeStoppedStatus
} from "./boot-status.js";
import { mountClientBootShell } from "./boot-shell.js";
import { createClientSettingsStore } from "./persistence.js";
import { createPlayerCommandPipeline } from "./player-command-pipeline.js";
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
  resolution: initialSessionEntry
});
let stopCommandPipeline: (() => void) | null = null;

void orchestrator
  .startSession(initialSessionRequest)
  .then((session) => {
    stopCommandPipeline?.();
    stopCommandPipeline = attachPlayerCommandPipeline({
      canvas: bootShell.canvas,
      submitCommand: (command) => {
        session.submitPlayerCommand(command);
      }
    });

    const joinedSession = session.getSessionJoined();
    if (joinedSession !== null) {
      bootShell.setStatus(describeJoinedStatus(joinedSession));
    }

    const latestSnapshot = session.getLatestSnapshot();
    if (latestSnapshot !== null) {
      bootShell.setStatus(describeSnapshotStatus(latestSnapshot));
    }

    session.subscribe((event) => {
      if (event.type === "joined") {
        bootShell.setStatus(describeJoinedStatus(event.joined));
        return;
      }

      if (event.type === "snapshot") {
        bootShell.setStatus(describeSnapshotStatus(event.snapshot));
        return;
      }

      if (event.type === "protocol-error") {
        bootShell.setStatus(describeProtocolErrorStatus(event.error));
        return;
      }

      if (event.type === "stopped") {
        stopCommandPipeline?.();
        stopCommandPipeline = null;
        bootShell.setStatus(describeStoppedStatus());
      }
    });
  })
  .catch((error: unknown) => {
    stopCommandPipeline?.();
    stopCommandPipeline = null;
    const message =
      error instanceof Error ? error.message : "failed to start session";
    bootShell.setStatus(describeStartupFailureStatus(message));
  });

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
