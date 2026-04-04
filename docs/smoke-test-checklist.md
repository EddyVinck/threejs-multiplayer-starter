# Manual smoke test checklist

Use this before releases or after risky changes. Run the dev stack with `pnpm dev` (server + Vite client) unless noted. Use two browser profiles or windows for multiplayer flows.

## Prerequisites

- [ ] `pnpm install` completed successfully
- [ ] `pnpm test`, `pnpm typecheck`, and `pnpm lint` pass (automated gate)

## Automated build smoke

- [ ] `pnpm smoke:build` completes: runs the full workspace `pnpm build`, then verifies shared/server/client outputs exist (`packages/*/dist/...`, including at least one client JS bundle under `packages/client/dist/assets/`).

> **Note:** Serving the built client from the Node server for a deploy-shaped smoke is tracked separately in the boilerplate implementation plan (production static hosting). Until that lands, rely on `pnpm dev` for interactive checks and `pnpm smoke:build` to confirm the build and on-disk artifacts.

## Single-player start

- [ ] Open the app URL shown by Vite (typically `http://localhost:5173` with API proxied to the dev server).
- [ ] Pre-game shell loads; **Play Solo** is the obvious primary action.
- [ ] Click **Play Solo**; session starts, 3D view appears, movement and camera work.
- [ ] Pickups can be collected; score / HUD update as expected.

## Create room

- [ ] From the pre-game shell, click **Create Room** (or equivalent).
- [ ] A room code is shown or reflected in the UI; URL may update with a `room` query parameter for sharing.

## Quick join

- [ ] With at least one public room available (or after creating one), click **Quick Join**.
- [ ] You land in a multiplayer session without being stuck on a dead-end state.

## Join by code

- [ ] Player A creates a room and notes the short room code.
- [ ] Player B enters that code via **Join Room** (or equivalent) and joins the same session.

## URL join

- [ ] Copy the invite URL after creating or joining a multiplayer room (includes `?room=...` or `?roomCode=...` per client resolution).
- [ ] Open that URL in a fresh tab or browser; the client should attempt join-by-code for a valid code.

## Late join

- [ ] Player A starts a round (timer running, pickups active).
- [ ] Player B joins mid-round via quick join or code.
- [ ] B receives a valid world state (scores, timer, entities) and can play without a blank or broken state.

## Round reset

- [ ] Let the round timer expire or trigger the configured reset.
- [ ] A new round begins; session is not dropped; gameplay resumes quickly.

## Reconnect behavior

- [ ] While in an active multiplayer session, simulate connection loss (disable network, kill tab, or refresh).
- [ ] Observe reasonable behavior: error or reconnection messaging where implemented, or clean return to pre-game; no silent permanent hang without UI feedback.

## Production build startup (artifact check)

- [ ] Run `pnpm smoke:build` from the repository root.
- [ ] Confirm shared, server, and client packages all build without errors.

## Optional: jam constraints spot-check

- [ ] Run `pnpm validate:jam` after a production build (or rely on `pnpm smoke:build`, which runs the same checks). It asserts minimal HTML, optional `dist/` JS/WASM size budgets, and no auth-related terms in `packages/client/src`.
- [ ] No login, signup, or account prompts.
- [ ] Initial load remains acceptable for a small jam game (no mandatory long splash if not intended).

Record the date, commit, and any failures in the boilerplate implementation plan progress log when used for release gating.
