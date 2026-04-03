- [x] P0: Initialize the pnpm workspace with `client`, `server`, and `shared` packages, root scripts, strict TypeScript config, ESLint, Prettier, Vitest, and a single `pnpm dev` entrypoint orchestrated with `concurrently`.
- [ ] P0: Establish the shared contract kit first, including message envelopes, protocol event names, Zod schemas, DTOs, room code utilities, and pure serialization helpers.
- [ ] P0: Define the core simulation model in `shared` and `server` terms before building rendering, including entity state shape, pickup rules, score state, round timer state, and reset semantics.
- [ ] P0: Build the simulation core as a deep module with a small public interface for fixed-step updates, snapshot export, delta production, round reset, and late-join hydration.
- [ ] P0: Write the first automated tests for the shared contract kit, covering schema validation, room code generation, message envelope behavior, and pure utility functions.
- [ ] P0: Write the first automated tests for the simulation core, covering pickup collection, score updates, timer progression, round reset behavior, and deterministic update outcomes.

- [ ] P0: Build the server foundation with Express, Socket.IO, and a single global authoritative tick loop.
- [ ] P0: Implement the room runtime as a deep server module that owns room creation, quick join matching, room-code joins, public ephemeral room policy, membership, late join eligibility, and room lifecycle.
- [ ] P0: Add automated tests for the room runtime that validate room creation, quick join behavior, join-by-code behavior, late join, and round lifecycle transitions through the public API.
- [ ] P0: Implement transport boundary validation with Zod for all incoming socket payloads and outgoing snapshot or delta contracts.
- [ ] P0: Implement the realtime transport layer as a deep module that hides Socket.IO wiring behind stable interfaces for connect, disconnect, join, snapshot delivery, delta delivery, and command submission.

- [ ] P0: Build the local loopback session adapter so single-player and multiplayer share the same session interface from the beginning.
- [ ] P0: Build the session orchestrator as a deep module that selects single-player, quick join, create room, or join by code, and hides loopback versus remote transport details from the rest of the app.
- [ ] P0: Ensure URL-based room join support is represented in the session entry flow from the start, even before the UI is polished.

- [ ] P1: Scaffold the Vite client with a minimal boot flow, canvas mounting, DOM overlay root, and asset-light startup path.
- [ ] P1: Implement the persistence layer as a deep module for player name, volume, mute, and lightweight settings with validation, versioning, and fallback behavior.
- [ ] P1: Add automated tests for the persistence layer covering save, load, migration, corruption fallback, and default restoration behavior.
- [ ] P1: Implement the player command pipeline as a deep client module that captures keyboard and mouse input, normalizes it into high-level commands, and emits compact command snapshots at a fixed network rate.
- [ ] P1: Add automated tests for the player command pipeline covering device normalization and command snapshot generation behavior.

- [ ] P1: Integrate Rapier 3D through a physics adapter that hides engine setup, body creation, colliders, stepping, and gameplay-facing queries behind a simple interface.
- [ ] P1: Implement free-flying kinematic or player-driven movement against a mostly static world using the physics adapter.
- [ ] P1: Build the third-person orbit or chase camera controller as a deep module with smoothing, target follow behavior, and mouse-driven orbit input.
- [ ] P1: Build the render scene adapter to map simulation state into Three.js scene objects, minimal materials, simple lighting, and debug-friendly primitives.
- [ ] P1: Keep the initial rendering path intentionally lightweight and avoid heavy starter assets, post-processing, or large downloads.

- [ ] P1: Build the tiny sample arena or playground with minimal primitives and clear navigable space.
- [ ] P1: Implement the arena gameplay module with pickup spawning, pickup collection, per-player score tracking, match timer, and round reset flow.
- [ ] P1: Make sure the sample mode works both through the loopback single-player path and through the multiplayer room path without special-case gameplay logic.
- [ ] P1: Verify late join by sending an authoritative room snapshot followed by live updates and ensuring a new client can enter an in-progress round in a valid state.

- [ ] P1: Build the lightweight DOM/CSS UI shell with a small pre-game screen, single-player as the primary CTA, and multiplayer actions visible but secondary.
- [ ] P1: Add create room, quick join, and join-by-code flows to the UI shell, including room-link handling via URL parameters.
- [ ] P1: Add local player name editing and settings controls to the UI shell with persistence integration.
- [ ] P1: Add a minimal in-game HUD showing score, round timer, and room state relevant to the current mode.

- [ ] P2: Build the Web Audio API-based audio manager as a deep module with unlock-on-user-gesture behavior, master gain, mute, volume, and simple named playback hooks.
- [ ] P2: Integrate lightweight audio cues for pickup collection, UI interactions, and round transitions without introducing large bundled audio assets.
- [ ] P2: Add client-side diagnostics for FPS, connection state, and other lightweight runtime signals behind a debug toggle.
- [ ] P2: Add manual smoke-test scripts or checklists for single-player start, room creation, quick join, join by code, URL join, late join, round reset, reconnect behavior, and production build startup.
- [ ] P2: Add production build scripts so the client builds separately and is served statically by the server in the final deployable app shape.
- [ ] P2: Validate the final package against the jam constraints by checking startup time, avoiding loading screens, minimizing first-load weight, and confirming no login or signup flows exist.
- [ ] P2: Review all deep module interfaces after the first end-to-end pass and simplify any surface area that became too chatty or leaked implementation details.

## Progress Log

- 2026-04-03: Completed the workspace bootstrap P0 task by adding the root pnpm workspace, strict TypeScript base config, ESLint/Prettier/Vitest tooling, `pnpm dev` orchestration with `concurrently`, and minimal `client`, `server`, and `shared` package skeletons. Files changed: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `packages/client/*`, `packages/server/*`, `packages/shared/*`, and `specs/boilerplate-implementation-plan.md`. Checks run: `pnpm lint` passed, `pnpm typecheck` passed, `pnpm test` passed with no test files, and `pnpm build` passed. Next recommended task: establish the shared contract kit with protocol envelopes, Zod schemas, DTOs, room-code helpers, and pure serialization utilities.
