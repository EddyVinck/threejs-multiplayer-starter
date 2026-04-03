import {
  authoritativeRoomStateSchema,
  defaultSimulationRules,
  playerCommandSchema,
  roomDeltaSchema,
  roomSnapshotSchema,
  simulationRulesSchema,
  type ArenaLayout,
  type AuthoritativeRoomState,
  type DisplayName,
  type PlayerCommand,
  type PlayerId,
  type RoomDelta,
  type RoomSnapshot,
  type RoomVisibility,
  type SessionMode,
  type SimulationPickupState,
  type SimulationPlayerState,
  type SimulationRules,
  type Vector3
} from "@gamejam/shared";

const DEFAULT_PLAYER_MOVE_SPEED = 6;

export type SimulationCoreOptions = {
  roomId: AuthoritativeRoomState["roomId"];
  roomCode: AuthoritativeRoomState["roomCode"];
  mode: SessionMode;
  visibility: RoomVisibility;
  lateJoinAllowed: boolean;
  arena: ArenaLayout;
  rules?: SimulationRules;
};

export type SimulationCorePlayerRegistration = {
  playerId: PlayerId;
  displayName: DisplayName;
  connected?: boolean;
};

export type SimulationCoreEvent =
  | {
      type: "player-joined";
      playerId: PlayerId;
    }
  | {
      type: "pickup-collected";
      playerId: PlayerId;
      pickupId: SimulationPickupState["pickupId"];
      scoreAwarded: number;
    }
  | {
      type: "pickup-respawned";
      pickupId: SimulationPickupState["pickupId"];
    }
  | {
      type: "round-started";
      roundNumber: number;
    }
  | {
      type: "round-reset-scheduled";
      resetAtTick: number;
    }
  | {
      type: "round-reset-completed";
      roundNumber: number;
    };

export type SimulationStepResult = {
  serverTick: number;
  roundPhase: RoomSnapshot["round"]["phase"];
  stateChanged: boolean;
  events: SimulationCoreEvent[];
};

type MutableState = AuthoritativeRoomState;

type DirtyState = {
  players: Set<PlayerId>;
  removedPlayers: Set<PlayerId>;
  pickups: Set<SimulationPickupState["pickupId"]>;
  round: boolean;
};

function cloneVector3(value: Vector3): Vector3 {
  return {
    x: value.x,
    y: value.y,
    z: value.z
  };
}

function clonePlayer(player: SimulationPlayerState): SimulationPlayerState {
  return {
    ...player,
    position: cloneVector3(player.position),
    velocity: cloneVector3(player.velocity),
    score: {
      ...player.score
    }
  };
}

function ticksFromMs(durationMs: number, tickRate: number): number {
  if (durationMs <= 0) {
    return 0;
  }

  return Math.max(1, Math.ceil((durationMs * tickRate) / 1000));
}

function ticksToMs(ticks: number, tickRate: number): number {
  return Math.max(0, Math.round((ticks * 1000) / tickRate));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function vectorLengthSquared(vector: Vector3): number {
  return vector.x ** 2 + vector.y ** 2 + vector.z ** 2;
}

function normalizeInput(vector: Vector3): Vector3 {
  const lengthSquared = vectorLengthSquared(vector);
  if (lengthSquared <= 1) {
    return vector;
  }

  const length = Math.sqrt(lengthSquared);
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}

function areVectorsEqual(left: Vector3, right: Vector3): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function pickSpawnIndex(playerId: PlayerId, spawnCount: number): number {
  let hash = 0;
  for (const character of playerId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash % spawnCount;
}

function createPickupState(
  arena: ArenaLayout,
  rules: SimulationRules
): SimulationPickupState[] {
  return arena.pickupSpawns.map((spawnPoint) => ({
    pickupId: spawnPoint.pickupId,
    kind: spawnPoint.kind,
    spawnId: spawnPoint.pickupId,
    position: cloneVector3(spawnPoint.position),
    active: true,
    scoreValue: rules.pickup.scoreValue,
    collectedByPlayerId: null,
    collectedAtTick: null,
    respawnAtTick: null
  }));
}

function buildRoundState(state: MutableState): RoomSnapshot["round"] {
  const tickRate = state.rules.tickRate;
  const remainingTicks =
    state.round.phase === "resetting"
      ? Math.max(0, (state.round.reset?.resetAtTick ?? state.serverTick) - state.serverTick)
      : Math.max(0, state.round.endsAtTick - state.serverTick);

  return {
    phase: state.round.phase,
    roundNumber: state.round.roundNumber,
    remainingMs:
      state.round.phase === "waiting" ? 0 : ticksToMs(remainingTicks, tickRate)
  };
}

function buildRoomSnapshot(state: MutableState): RoomSnapshot {
  return roomSnapshotSchema.parse({
    roomId: state.roomId,
    roomCode: state.roomCode,
    mode: state.mode,
    visibility: state.visibility,
    lateJoinAllowed: state.lateJoinAllowed,
    serverTick: state.serverTick,
    round: buildRoundState(state),
    players: state.players.map((player) => ({
      playerId: player.playerId,
      displayName: player.displayName,
      position: cloneVector3(player.position),
      velocity: cloneVector3(player.velocity),
      yaw: player.yaw,
      score: player.score.total,
      connected: player.connected
    })),
    pickups: state.pickups.map((pickup) => ({
      pickupId: pickup.pickupId,
      position: cloneVector3(pickup.position),
      active: pickup.active,
      respawnAtTick: pickup.respawnAtTick
    }))
  });
}

function emptyDirtyState(): DirtyState {
  return {
    players: new Set<PlayerId>(),
    removedPlayers: new Set<PlayerId>(),
    pickups: new Set<SimulationPickupState["pickupId"]>(),
    round: false
  };
}

export type SimulationCore = {
  upsertPlayer(
    registration: SimulationCorePlayerRegistration
  ): SimulationPlayerState;
  removePlayer(playerId: PlayerId): boolean;
  setPlayerConnected(playerId: PlayerId, connected: boolean): boolean;
  submitPlayerCommand(playerId: PlayerId, command: PlayerCommand): void;
  step(): SimulationStepResult;
  exportSnapshot(): RoomSnapshot;
  exportDelta(): RoomDelta | null;
  hydrateLateJoin(playerId: PlayerId): RoomSnapshot;
  forceRoundReset(): boolean;
  getAuthoritativeState(): AuthoritativeRoomState;
};

export function createSimulationCore(
  options: SimulationCoreOptions
): SimulationCore {
  const rules = simulationRulesSchema.parse(options.rules ?? defaultSimulationRules);

  const state: MutableState = authoritativeRoomStateSchema.parse({
    roomId: options.roomId,
    roomCode: options.roomCode,
    mode: options.mode,
    visibility: options.visibility,
    lateJoinAllowed: options.lateJoinAllowed,
    serverTick: 0,
    rules,
    arena: options.arena,
    round: {
      phase: "waiting",
      roundNumber: 0,
      startedAtTick: 0,
      endsAtTick: 0,
      reset: null
    },
    players: [],
    pickups: createPickupState(options.arena, rules)
  });

  const dirty = emptyDirtyState();
  const latestCommands = new Map<PlayerId, PlayerCommand>();
  const roundDurationTicks = ticksFromMs(rules.round.durationMs, rules.tickRate);
  const roundResetTicks = ticksFromMs(
    rules.round.resetDurationMs,
    rules.tickRate
  );

  function markPlayerDirty(playerId: PlayerId): void {
    dirty.players.add(playerId);
  }

  function markPickupDirty(pickupId: SimulationPickupState["pickupId"]): void {
    dirty.pickups.add(pickupId);
  }

  function markRoundDirty(): void {
    dirty.round = true;
  }

  function getSpawnForPlayer(playerId: PlayerId) {
    const spawnIndex = pickSpawnIndex(
      playerId,
      state.arena.playerSpawns.length
    );
    const fallbackSpawn = state.arena.playerSpawns[0];

    if (!fallbackSpawn) {
      throw new Error("arena must define at least one player spawn");
    }

    return state.arena.playerSpawns[spawnIndex] ?? fallbackSpawn;
  }

  function resetPlayerForRound(player: SimulationPlayerState): void {
    const spawn = getSpawnForPlayer(player.playerId);
    player.spawnId = spawn.spawnId;
    player.position = cloneVector3(spawn.position);
    player.velocity = { x: 0, y: 0, z: 0 };
    player.yaw = spawn.yaw;
    player.score = {
      total: 0,
      pickupsCollected: 0,
      lastPickupTick: null
    };
    markPlayerDirty(player.playerId);
  }

  function resetPickupsForRound(): void {
    for (const pickup of state.pickups) {
      const spawn = state.arena.pickupSpawns.find(
        (spawnPoint) => spawnPoint.pickupId === pickup.pickupId
      );

      if (!spawn) {
        continue;
      }

      pickup.position = cloneVector3(spawn.position);
      pickup.kind = spawn.kind;
      pickup.active = true;
      pickup.collectedAtTick = null;
      pickup.collectedByPlayerId = null;
      pickup.respawnAtTick = null;
      markPickupDirty(pickup.pickupId);
    }
  }

  function beginRound(roundNumber: number, events: SimulationCoreEvent[]): void {
    state.round.phase = "active";
    state.round.roundNumber = roundNumber;
    state.round.startedAtTick = state.serverTick;
    state.round.endsAtTick = state.serverTick + roundDurationTicks;
    state.round.reset = null;
    markRoundDirty();
    events.push({
      type: "round-started",
      roundNumber
    });
  }

  function transitionToWaiting(): void {
    state.round.phase = "waiting";
    state.round.startedAtTick = state.serverTick;
    state.round.endsAtTick = state.serverTick;
    state.round.reset = null;
    markRoundDirty();
  }

  function scheduleRoundReset(events: SimulationCoreEvent[]): void {
    if (state.round.phase !== "active") {
      return;
    }

    state.round.phase = "resetting";
    state.round.reset = {
      reason: "round-complete",
      scheduledAtTick: state.serverTick,
      resetAtTick: state.serverTick + roundResetTicks
    };
    markRoundDirty();
    events.push({
      type: "round-reset-scheduled",
      resetAtTick: state.round.reset.resetAtTick
    });

    if (state.round.reset.resetAtTick === state.serverTick) {
      completeRoundReset(events);
    }
  }

  function completeRoundReset(events: SimulationCoreEvent[]): void {
    resetPickupsForRound();

    for (const player of state.players) {
      resetPlayerForRound(player);
    }

    if (state.players.length === 0) {
      transitionToWaiting();
      events.push({
        type: "round-reset-completed",
        roundNumber: state.round.roundNumber
      });
      return;
    }

    const nextRoundNumber = Math.max(1, state.round.roundNumber + 1);
    beginRound(nextRoundNumber, events);
    events.push({
      type: "round-reset-completed",
      roundNumber: nextRoundNumber
    });
  }

  function clampPosition(position: Vector3): Vector3 {
    const halfWidth = state.arena.bounds.width / 2;
    const halfDepth = state.arena.bounds.depth / 2;

    return {
      x: clamp(position.x, -halfWidth, halfWidth),
      y: clamp(position.y, 0, state.arena.bounds.height),
      z: clamp(position.z, -halfDepth, halfDepth)
    };
  }

  function updatePlayerMovement(player: SimulationPlayerState): void {
    const command = latestCommands.get(player.playerId);
    const deltaSeconds = 1 / state.rules.tickRate;

    if (!command || !player.connected) {
      if (!areVectorsEqual(player.velocity, { x: 0, y: 0, z: 0 })) {
        player.velocity = { x: 0, y: 0, z: 0 };
        markPlayerDirty(player.playerId);
      }
      return;
    }

    const normalizedMove = normalizeInput({
      x: command.move.x,
      y: command.move.y,
      z: command.move.z
    });
    const nextVelocity = {
      x: normalizedMove.x * DEFAULT_PLAYER_MOVE_SPEED,
      y: normalizedMove.y * DEFAULT_PLAYER_MOVE_SPEED,
      z: normalizedMove.z * DEFAULT_PLAYER_MOVE_SPEED
    };
    const nextPosition = clampPosition({
      x: player.position.x + nextVelocity.x * deltaSeconds,
      y: player.position.y + nextVelocity.y * deltaSeconds,
      z: player.position.z + nextVelocity.z * deltaSeconds
    });

    if (!areVectorsEqual(player.velocity, nextVelocity)) {
      player.velocity = nextVelocity;
      markPlayerDirty(player.playerId);
    }

    if (!areVectorsEqual(player.position, nextPosition)) {
      player.position = nextPosition;
      markPlayerDirty(player.playerId);
    }

    if (player.yaw !== command.look.yaw) {
      player.yaw = command.look.yaw;
      markPlayerDirty(player.playerId);
    }

    if (player.lastProcessedCommandSequence !== command.sequence) {
      player.lastProcessedCommandSequence = command.sequence;
      markPlayerDirty(player.playerId);
    }
  }

  function maybeRespawnPickups(events: SimulationCoreEvent[]): void {
    for (const pickup of state.pickups) {
      if (
        pickup.active ||
        pickup.respawnAtTick === null ||
        state.serverTick < pickup.respawnAtTick
      ) {
        continue;
      }

      const spawn = state.arena.pickupSpawns.find(
        (spawnPoint) => spawnPoint.pickupId === pickup.pickupId
      );
      if (!spawn) {
        continue;
      }

      pickup.position = cloneVector3(spawn.position);
      pickup.active = true;
      pickup.collectedAtTick = null;
      pickup.collectedByPlayerId = null;
      pickup.respawnAtTick = null;
      markPickupDirty(pickup.pickupId);
      events.push({
        type: "pickup-respawned",
        pickupId: pickup.pickupId
      });
    }
  }

  function maybeCollectPickups(events: SimulationCoreEvent[]): void {
    const collisionDistance =
      state.rules.playerCollisionRadius + state.rules.pickup.collisionRadius;
    const collisionDistanceSquared = collisionDistance ** 2;

    for (const pickup of state.pickups) {
      if (!pickup.active) {
        continue;
      }

      const collector = state.players.find((player) => {
        if (!player.connected) {
          return false;
        }

        const offset = {
          x: player.position.x - pickup.position.x,
          y: player.position.y - pickup.position.y,
          z: player.position.z - pickup.position.z
        };

        return vectorLengthSquared(offset) <= collisionDistanceSquared;
      });

      if (!collector) {
        continue;
      }

      pickup.active = false;
      pickup.collectedByPlayerId = collector.playerId;
      pickup.collectedAtTick = state.serverTick;
      pickup.respawnAtTick = state.serverTick + state.rules.pickup.respawnTicks;
      markPickupDirty(pickup.pickupId);

      collector.score.total += pickup.scoreValue;
      collector.score.pickupsCollected += 1;
      collector.score.lastPickupTick = state.serverTick;
      markPlayerDirty(collector.playerId);

      events.push({
        type: "pickup-collected",
        playerId: collector.playerId,
        pickupId: pickup.pickupId,
        scoreAwarded: pickup.scoreValue
      });
    }
  }

  function ensureActiveRound(events: SimulationCoreEvent[]): void {
    if (state.round.phase === "waiting" && state.players.length > 0) {
      beginRound(1, events);
    }
  }

  return {
    upsertPlayer(registration) {
      const connected = registration.connected ?? true;
      const existingPlayer = state.players.find(
        (player) => player.playerId === registration.playerId
      );

      if (existingPlayer) {
        let changed = false;

        if (existingPlayer.displayName !== registration.displayName) {
          existingPlayer.displayName = registration.displayName;
          changed = true;
        }

        if (existingPlayer.connected !== connected) {
          existingPlayer.connected = connected;
          if (!connected) {
            existingPlayer.velocity = { x: 0, y: 0, z: 0 };
          }
          changed = true;
        }

        if (changed) {
          markPlayerDirty(existingPlayer.playerId);
        }

        return clonePlayer(existingPlayer);
      }

      if (state.players.length >= state.rules.maxPlayers) {
        throw new Error("room is full");
      }

      const spawn = getSpawnForPlayer(registration.playerId);
      const player = authoritativeRoomStateSchema.shape.players.element.parse({
        playerId: registration.playerId,
        displayName: registration.displayName,
        connected,
        joinedAtTick: state.serverTick,
        spawnId: spawn.spawnId,
        position: cloneVector3(spawn.position),
        velocity: { x: 0, y: 0, z: 0 },
        yaw: spawn.yaw,
        score: {
          total: 0,
          pickupsCollected: 0,
          lastPickupTick: null
        },
        lastProcessedCommandSequence: 0
      });

      state.players.push(player);
      markPlayerDirty(player.playerId);

      const events: SimulationCoreEvent[] = [
        {
          type: "player-joined",
          playerId: player.playerId
        }
      ];
      ensureActiveRound(events);

      return clonePlayer(player);
    },

    removePlayer(playerId) {
      const playerIndex = state.players.findIndex(
        (candidate) => candidate.playerId === playerId
      );
      if (playerIndex === -1) {
        return false;
      }

      state.players.splice(playerIndex, 1);
      latestCommands.delete(playerId);
      dirty.players.delete(playerId);
      dirty.removedPlayers.add(playerId);

      if (state.players.length === 0) {
        resetPickupsForRound();
        state.round.roundNumber = 0;
        transitionToWaiting();
      } else {
        markRoundDirty();
      }

      return true;
    },

    setPlayerConnected(playerId, connected) {
      const player = state.players.find((candidate) => candidate.playerId === playerId);
      if (!player) {
        return false;
      }

      if (player.connected === connected) {
        return true;
      }

      player.connected = connected;
      if (!connected) {
        player.velocity = { x: 0, y: 0, z: 0 };
      }
      markPlayerDirty(player.playerId);
      return true;
    },

    submitPlayerCommand(playerId, command) {
      const player = state.players.find((candidate) => candidate.playerId === playerId);
      if (!player) {
        throw new Error(`unknown player: ${playerId}`);
      }

      latestCommands.set(playerId, playerCommandSchema.parse(command));
    },

    step() {
      const events: SimulationCoreEvent[] = [];

      state.serverTick += 1;

      if (state.round.phase === "active") {
        markRoundDirty();

        for (const player of state.players) {
          updatePlayerMovement(player);
        }

        maybeCollectPickups(events);
        maybeRespawnPickups(events);

        if (state.serverTick >= state.round.endsAtTick) {
          scheduleRoundReset(events);
        }
      } else if (state.round.phase === "resetting") {
        markRoundDirty();
        maybeRespawnPickups(events);

        if (
          state.round.reset &&
          state.serverTick >= state.round.reset.resetAtTick
        ) {
          completeRoundReset(events);
        }
      }

      return {
        serverTick: state.serverTick,
        roundPhase: state.round.phase,
        stateChanged:
          dirty.round || dirty.players.size > 0 || dirty.pickups.size > 0,
        events
      };
    },

    exportSnapshot() {
      return buildRoomSnapshot(state);
    },

    exportDelta() {
      if (
        !dirty.round &&
        dirty.players.size === 0 &&
        dirty.removedPlayers.size === 0 &&
        dirty.pickups.size === 0
      ) {
        return null;
      }

      const players = state.players
        .filter((player) => dirty.players.has(player.playerId))
        .map((player) => ({
          playerId: player.playerId,
          displayName: player.displayName,
          position: cloneVector3(player.position),
          velocity: cloneVector3(player.velocity),
          yaw: player.yaw,
          score: player.score.total,
          connected: player.connected
        }));
      const pickups = state.pickups
        .filter((pickup) => dirty.pickups.has(pickup.pickupId))
        .map((pickup) => ({
          pickupId: pickup.pickupId,
          position: cloneVector3(pickup.position),
          active: pickup.active,
          respawnAtTick: pickup.respawnAtTick
        }));

      const delta = roomDeltaSchema.parse({
        roomId: state.roomId,
        roomCode: state.roomCode,
        serverTick: state.serverTick,
        round: dirty.round ? buildRoundState(state) : undefined,
        updatedPlayers: players,
        removedPlayerIds: [...dirty.removedPlayers],
        updatedPickups: pickups,
        removedPickupIds: []
      });

      dirty.players.clear();
      dirty.removedPlayers.clear();
      dirty.pickups.clear();
      dirty.round = false;

      return delta;
    },

    hydrateLateJoin(playerId) {
      const player = state.players.find((candidate) => candidate.playerId === playerId);
      if (!player) {
        throw new Error(`cannot hydrate unknown player: ${playerId}`);
      }

      return buildRoomSnapshot(state);
    },

    forceRoundReset() {
      if (state.round.phase !== "active") {
        return false;
      }

      scheduleRoundReset([]);
      return true;
    },

    getAuthoritativeState() {
      return authoritativeRoomStateSchema.parse(structuredClone(state));
    }
  };
}
