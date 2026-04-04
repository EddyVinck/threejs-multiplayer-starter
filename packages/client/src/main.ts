import "./styles.css";

import { createSessionOrchestrator } from "./session-orchestrator.js";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Expected #app root element");
}

app.innerHTML = `
  <main class="shell">
    <h1>Game Jam Boilerplate</h1>
    <p id="session-status">Starting the shared session flow...</p>
  </main>
`;

const sessionStatus =
  app.querySelector<HTMLParagraphElement>("#session-status");

if (!sessionStatus) {
  throw new Error("Expected #session-status element");
}

const orchestrator = createSessionOrchestrator();

void orchestrator
  .startSession({
    mode: "single-player"
  })
  .then((session) => {
    sessionStatus.textContent = "Single-player loopback session is running.";

    session.subscribe((event) => {
      if (event.type === "joined") {
        sessionStatus.textContent = `Joined ${event.joined.mode} session ${event.joined.roomCode}.`;
        return;
      }

      if (event.type === "snapshot") {
        sessionStatus.textContent = `Room ${event.snapshot.roomCode} has ${event.snapshot.players.length} player(s).`;
        return;
      }

      if (event.type === "protocol-error") {
        sessionStatus.textContent = `Session error: ${event.error.message}`;
        return;
      }

      if (event.type === "stopped") {
        sessionStatus.textContent = "Session stopped.";
      }
    });
  })
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "failed to start session";
    sessionStatus.textContent = `Unable to start session: ${message}`;
  });
