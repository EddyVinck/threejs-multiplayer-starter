import "./styles.css";

import {
  describeJoinedStatus,
  describeProtocolErrorStatus,
  describeSnapshotStatus,
  describeStartupFailureStatus,
  describeStoppedStatus
} from "./boot-status.js";
import { mountClientBootShell } from "./boot-shell.js";
import { createSessionOrchestrator } from "./session-orchestrator.js";
import { resolveInitialSessionEntry } from "./session-entry.js";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Expected #app root element");
}

const orchestrator = createSessionOrchestrator();
const initialSessionEntry = resolveInitialSessionEntry(window.location.search);
const bootShell = mountClientBootShell({
  appRoot: app,
  resolution: initialSessionEntry
});

void orchestrator
  .startSession(initialSessionEntry.request)
  .then((session) => {
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
        bootShell.setStatus(describeStoppedStatus());
      }
    });
  })
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "failed to start session";
    bootShell.setStatus(describeStartupFailureStatus(message));
  });
