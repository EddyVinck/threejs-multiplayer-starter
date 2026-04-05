# Game jam boilerplate

A TypeScript-first web game starter: **Vite** + **Three.js** + **Rapier** on the client, **Express** + **Socket.IO** on the server, and **shared** Zod-validated contracts. Single-player is the default path; multiplayer is server-authoritative and room-based, without accounts or backend persistence beyond what each browser stores locally.

This starter repo intentionally stays simple in a few places. There are no accounts, no backend persistence, and no advanced rollback/prediction netcode. That makes it especially good for game jams, prototypes, and small multiplayer projects.

![Multiplayer demo gif](./gamejam-starter-multiplayer.gif)

**Packages:** `@gamejam/client` (UI, rendering, input), `@gamejam/server` (HTTP, realtime, tick loop), `@gamejam/shared` (schemas, simulation-facing types). Product goals and architecture notes live in `specs/boilerplate-spec.md`.

## Prerequisites

- [Node.js](https://nodejs.org/) (current LTS is fine)
- [pnpm](https://pnpm.io/) (version in `package.json` → `packageManager`)

## Development

Runs the **server** (HTTP + Socket.IO on port **3001**) and the **Vite** dev client (port **5173**) together. The browser loads the app from Vite; multiplayer connects the Socket.IO client to the game server on the same host.

```bash
pnpm install
pnpm dev
```

Open the URL Vite prints (typically `http://127.0.0.1:5173`).

## Production-style run (localhost)

Builds the client to `packages/client/dist`, bundles the server into `packages/server/dist/index.js`, then serves the static client from the same Node process as Socket.IO (deploy-shaped setup):

```bash
pnpm build
pnpm start
```

Open **`http://127.0.0.1:3001`**. Override the port with `PORT`, for example `PORT=4000 pnpm start`.
