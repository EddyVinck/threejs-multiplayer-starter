## Problem Statement

The user wants a game jam-ready web game boilerplate that gets players into a playable experience almost immediately, requires no login or signup, supports free public web access, and leaves a clean path to optional multiplayer. The user wants the stack to stay straightforward and TypeScript-first while still providing enough architecture to avoid a fragile jam codebase.

The boilerplate must support a fast-loading browser experience, plain Three.js rendering, a Node-hosted backend with Socket.IO for real-time play, and an implementation structure that can begin as single-player but expand into server-authoritative multiplayer without a rewrite. The user also wants the starter to feel like a real game foundation rather than an empty engine shell.

## Solution

Build a single deployable TypeScript workspace using pnpm with separate client, server, and shared packages. The client uses Vite, plain Three.js, Rapier 3D, a lightweight DOM/CSS UI layer, and a small Web Audio manager. The server uses Express with an attached Socket.IO server, in-memory room management, and a single global simulation tick. Shared contracts provide Zod-validated schemas, event envelopes, pure utilities, and simulation-facing types across the workspace.

The starter will prioritize single-player as the primary user path while remaining multiplayer-ready from day one through a loopback session adapter and a real room/session model. It will include a tiny 3D arena playground, a third-person orbit/chase camera, free-flying player movement, pickup collection as the sample gameplay loop, per-player scoring, round timer and reset flow, quick join plus room-code multiplayer UX, URL-based room joins, local settings persistence, and lightweight client-side diagnostics.

## User Stories

1. As a player, I want to open the game in a browser without creating an account, so that I can start playing immediately.
2. As a player, I want the game to load quickly with minimal waiting, so that the experience feels appropriate for a web game jam.
3. As a player, I want a simple pre-game screen, so that I can choose how to start without feeling blocked by setup.
4. As a player, I want single-player to be the clearest primary option, so that I can get into the game with one obvious action.
5. As a player, I want multiplayer options on the same screen, so that I can discover them without hunting through menus.
6. As a player, I want to enter an optional display name, so that I can be identified in multiplayer sessions.
7. As a player, I want my name and settings to persist locally, so that repeat visits feel frictionless.
8. As a player, I want to quick join a public room, so that I can find a multiplayer match with minimal effort.
9. As a player, I want quick join to place me into an available room or create one if needed, so that I am never stuck on a dead-end flow.
10. As a player, I want to create a room and share a short human-friendly code, so that friends can join easily.
11. As a player, I want to join by room code, so that I can enter a friend’s session directly.
12. As a player, I want room links to work through URL parameters, so that shared invites are one click when possible.
13. As a player, I want public rooms to be ephemeral, so that matchmaking stays lightweight and jam-friendly.
14. As a player, I want to be able to join a room even after a round has started, so that I do not have to wait for the next match to participate.
15. As a player, I want my client to receive the current authoritative room state when I join late, so that I enter the match in a valid synchronized state.
16. As a player, I want movement to feel responsive in a 3D world, so that the starter is immediately fun to prototype with.
17. As a player, I want a third-person orbit/chase camera, so that I can understand the world and my avatar position easily.
18. As a player, I want a tiny 3D arena to explore right away, so that the starter feels complete enough to build on.
19. As a player, I want pickups to appear in the world, so that there is an immediate objective beyond movement.
20. As a player, I want collecting a pickup to update my score, so that I get clear gameplay feedback.
21. As a player, I want other players to have their own scores, so that multiplayer sessions feel competitive.
22. As a player, I want rounds to have a timer and reset cleanly, so that matches have structure.
23. As a player, I want round resets to preserve the overall session and return me to play quickly, so that the experience stays smooth.
24. As a player, I want small sound effects and audio controls, so that the game feels more alive without heavy assets.
25. As a player, I want mute and volume settings to persist, so that I do not need to reconfigure audio each time.
26. As a player, I want the game to work without login, persistence, or account systems, so that access remains instant.
27. As a player, I want the game to remain playable in single-player even if multiplayer is unused, so that the starter is useful for many jam concepts.
28. As a player, I want multiplayer sessions to feel consistent, so that shared game state is trustworthy.
29. As a player, I want the server to act as the authority for multiplayer state, so that cheating and desync risk are reduced.
30. As a player, I want input and movement updates to feel smooth even with network latency, so that multiplayer remains usable.
31. As a developer, I want one root command to run the project locally, so that the dev loop stays fast.
32. As a developer, I want a single deployable app, so that hosting and operations remain simple during the jam.
33. As a developer, I want the client and server to live in one workspace, so that shared contracts are easy to maintain.
34. As a developer, I want shared schemas and protocol definitions, so that client and server cannot silently drift apart.
35. As a developer, I want runtime validation on network boundaries, so that malformed payloads are caught safely.
36. As a developer, I want deep modules with stable interfaces, so that I can iterate on internals without rewriting the whole codebase.
37. As a developer, I want pure simulation helpers separated from rendering, so that core game logic can be tested in isolation.
38. As a developer, I want physics details wrapped behind a gameplay-oriented adapter, so that engine-specific code does not leak everywhere.
39. As a developer, I want input normalized into high-level commands, so that local, AI, and networked control paths can share the same interface.
40. As a developer, I want a loopback local session adapter, so that single-player and multiplayer flows share the same architecture.
41. As a developer, I want room lifecycle logic isolated from transport details, so that networking and gameplay responsibilities stay clear.
42. As a developer, I want a global server tick to manage active rooms, so that timing is centralized and easier to reason about.
43. As a developer, I want the protocol to use typed event envelopes with versioning metadata, so that iteration during the jam is safer.
44. As a developer, I want state synchronization to use deltas plus occasional snapshots, so that multiplayer scales better than full-state spam.
45. As a developer, I want a late-join snapshot path, so that join-in-progress works without special one-off hacks.
46. As a developer, I want strict TypeScript settings, so that shared contracts and real-time systems are less error-prone.
47. As a developer, I want ESLint and Prettier in place, so that code quality does not collapse under jam pressure.
48. As a developer, I want a tiny but complete sample gameplay loop, so that I can verify the architecture through use instead of only through theory.
49. As a developer, I want minimal client-side diagnostics, so that I can inspect FPS, connection state, and multiplayer health during rapid iteration.
50. As a developer, I want a testing strategy focused on stable behavior, so that the highest-risk logic stays trustworthy without slowing the project down.

## Implementation Decisions

- The project will be built as a pnpm workspace with distinct client, server, and shared packages.
- The client stack will use Vite, plain Three.js, TypeScript, Rapier 3D, and plain DOM/CSS overlays.
- The server stack will use Express with an attached Socket.IO server in TypeScript.
- The application will be deployed as one app, with the client built separately and served by the server.
- Multiplayer readiness will be built in from the start, but single-player will remain the primary default flow.
- The simulation model will be server-authoritative for multiplayer.
- The simulation loop will use a fixed timestep with rendering decoupled from simulation timing.
- The server will use one global tick loop to advance all active rooms.
- Rooms will be stored in memory only and will assume a single-instance Node deployment target.
- Room access will support public ephemeral quick-join rooms plus private room-code joins.
- Rooms will use short human-friendly uppercase share codes for manual and URL-based join flows.
- Rooms will allow late join after match start.
- Late join will synchronize through a full authoritative snapshot on join followed by live delta updates.
- Ongoing state sync will use event or delta updates with occasional authoritative snapshots rather than full snapshots every tick.
- The protocol will use typed Socket.IO events wrapped in a lightweight versioned message envelope.
- Runtime validation at network boundaries will use Zod in addition to TypeScript types.
- Shared code will include schemas, protocol types, room code helpers, serialization helpers, and pure simulation utilities.
- The game architecture will follow a light ECS-style separation rather than a formal ECS framework.
- Input will be normalized into high-level player commands instead of exposing raw device state throughout the game.
- Command transmission will send compact snapshots at a fixed network rate rather than every render frame.
- The client will use a loopback local session adapter so that single-player and multiplayer share the same session interface.
- Movement will default to free-flying arcade-style control in a full 3D world.
- The camera will default to a third-person orbit or chase model.
- The physics layer will use the standard Rapier 3D package rather than the larger compat build.
- Physics usage will favor kinematic or player-driven movement across a mostly static world as the default gameplay pattern.
- The sample content will be a tiny arena or playground rather than an empty scene.
- The starter gameplay loop will be pickup collection in a small arena with competitive per-player scoring.
- The sample mode will include a short match timer and round reset flow.
- The UI shell will present single-player as the main action with multiplayer actions visible but secondary on the same screen.
- Audio will be included through a lightweight Web Audio API manager with browser unlock handling, volume, mute, and simple playback hooks.
- Local persistence will store lightweight settings such as player name, volume, mute, and other small preferences.
- Diagnostics will be client-side only for simplicity, while ordinary server logging can remain internal.
- Development will run through a single root command.
- Dev process orchestration will use concurrently.
- TypeScript will run in strict mode from the beginning.
- Tooling will use plain tsc where possible, with tsx watch for the server development loop.
- Formatting and linting will use ESLint plus Prettier.
- The implementation should favor deep modules with small stable interfaces over broad shallow modules.

- Proposed deep modules to build:
- Session Orchestrator: owns game mode selection, session lifecycle, loopback versus remote mode, and room flow orchestration behind a simple start or join interface.
- Realtime Transport: owns Socket.IO event wiring, message envelopes, versioning, reconnect handling, snapshots, and deltas behind a transport-facing contract.
- Room Runtime: owns room registry, quick join matching, codes, membership, late join rules, and authoritative room state progression.
- Simulation Core: owns fixed-step game state progression, scoring, timers, reset rules, and pure update logic independent of rendering.
- Physics Adapter: owns Rapier initialization, colliders, bodies, stepping, and gameplay-facing collision or movement queries.
- Player Command Pipeline: owns device capture, command normalization, input sampling, and command packet production.
- Camera Controller: owns third-person follow, orbit logic, smoothing, and camera targeting.
- Arena Gameplay Module: owns sample arena layout, pickup rules, spawn and respawn behavior, and competitive scoring behavior.
- Render Scene Adapter: owns mapping simulation state into Three.js scene state, visual debug primitives, and minimal rendering defaults.
- Audio Manager: owns Web Audio unlock, playback, gain control, mute state, and sound identifiers.
- UI Shell: owns the pre-game experience, room-code or link flows, settings controls, and diagnostics overlay.
- Persistence Layer: owns local settings serialization, validation, versioning, and recovery behavior.
- Shared Contract Kit: owns schemas, envelopes, DTOs, utility types, and deterministic pure helpers used across packages.

## Testing Decisions

- Good tests should validate external behavior through stable interfaces, not internal implementation details. Tests should avoid asserting on private state shape, rendering internals, transport library mechanics, or exact step-by-step implementation choices unless those details are part of the contract.
- The test strategy should focus on deep modules whose correctness matters across many game ideas and whose interfaces are likely to remain stable.
- The initial automated test suite should use Vitest only.
- The highest-value modules to test are the Shared Contract Kit, Room Runtime, Simulation Core, Player Command Pipeline, and Persistence Layer.
- Shared Contract Kit tests should verify schema acceptance and rejection, message envelope behavior, room-code behavior, and pure utility outputs.
- Room Runtime tests should verify room creation, quick join matching, late join eligibility, membership transitions, and round lifecycle behavior through the public room API.
- Simulation Core tests should verify fixed-step scoring, pickup resolution, timer progression, reset behavior, and deterministic update outcomes for representative inputs.
- Player Command Pipeline tests should verify device input normalization into high-level commands and fixed-rate command snapshot generation.
- Persistence Layer tests should verify settings load, save, migration, validation fallback, and corruption handling behavior.
- Physics Adapter tests should be added only if the public adapter surface is sufficiently stable and can be tested without brittle engine-coupled assertions; otherwise, its behavior should be covered indirectly through simulation tests.
- UI, rendering, and transport wiring should rely primarily on manual smoke testing unless a narrow pure interface emerges that is worth testing in isolation.
- There is no existing testing prior art in the current codebase because the workspace is effectively empty; this PRD establishes the initial testing baseline rather than extending an existing convention.

## Out of Scope

- User accounts, authentication, login, signup, and profile systems.
- Payments, monetization, premium content, or commerce of any kind.
- Match history, persistent progression, achievements, or backend persistence beyond local browser settings.
- Dedicated lobby browser interfaces beyond quick join and explicit room-code flows.
- Cross-instance room coordination, Redis-backed room storage, or horizontal multiplayer scaling.
- Serverless-first deployment support.
- Mobile-first controls, touch-first UX, or full mobile optimization.
- A full production-ready anti-cheat system.
- Voice chat, text chat, friends lists, or social graph features.
- A large art pipeline, heavy audio pack, cinematic loading flow, or large downloadable content.
- A sophisticated grounded character controller or advanced traversal framework.
- Full rollback netcode, immediate client-side prediction and reconciliation, or advanced lag compensation beyond the chosen authoritative snapshot and delta model.
- A large automated end-to-end browser test suite.
- A formal ECS library or a generalized game engine abstraction beyond what the starter actually needs.

## Further Notes

- The architecture should preserve a clear separation between simulation, rendering, physics, transport, and UI so that the starter can evolve into many different jam concepts.
- The sample gameplay loop exists to prove the architecture through play, not to define the eventual game. It should therefore stay intentionally small and easy to replace.
- The fastest path to success is to keep dependencies lean, startup fast, and public web access frictionless.
- This PRD is intentionally issue-ready in structure, but is currently stored as a local spec document and can later be adapted into a GitHub issue if needed.
