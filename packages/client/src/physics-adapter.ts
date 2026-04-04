import {
  Ball,
  ColliderDesc,
  Quaternion,
  RigidBodyDesc,
  World
} from "@dimforge/rapier3d/rapier.js";
import {
  resolveArenaMotion,
  type ArenaLayout,
  type EntityId,
  type PlayerId,
  type SimulationRules,
  type Vector3
} from "@gamejam/shared";

const ARENA_BOUNDARY_THICKNESS = 0.5;
const ARENA_BOUNDARY_OFFSET = ARENA_BOUNDARY_THICKNESS / 2;
const MOTION_SAFETY_MARGIN = 0.001;
const IDENTITY_ROTATION = new Quaternion(0, 0, 0, 1);
const ZERO_VECTOR: Vector3 = {
  x: 0,
  y: 0,
  z: 0
};

export type PhysicsAdapterOptions = {
  arena: ArenaLayout;
  rules: Pick<SimulationRules, "tickRate" | "playerCollisionRadius" | "pickup">;
  gravity?: Vector3;
};

export type PhysicsPlayerState = {
  playerId: PlayerId;
  position: Vector3;
  velocity?: Vector3;
};

export type PhysicsPickupState = {
  pickupId: EntityId;
  position: Vector3;
  active: boolean;
};

export type PhysicsPlayerPose = {
  position: Vector3;
  velocity: Vector3;
};

export type PhysicsMotionResult = {
  nextPosition: Vector3;
  blocked: boolean;
  blockingActorId: PlayerId | null;
};

type PlayerBodyRecord = {
  body: ReturnType<World["createRigidBody"]>;
  collider: ReturnType<World["createCollider"]>;
};

type PickupColliderRecord = {
  collider: ReturnType<World["createCollider"]>;
};

type ColliderKind =
  | {
      type: "arena";
      actorId: null;
    }
  | {
      type: "player";
      actorId: PlayerId;
    }
  | {
      type: "pickup";
      actorId: EntityId;
    };

export type PhysicsAdapter = {
  step(): void;
  syncPlayer(state: PhysicsPlayerState): void;
  removePlayer(playerId: PlayerId): boolean;
  getPlayerPose(playerId: PlayerId): PhysicsPlayerPose | null;
  movePlayer(playerId: PlayerId, desiredTranslation: Vector3): PhysicsMotionResult;
  syncPickup(state: PhysicsPickupState): void;
  removePickup(pickupId: EntityId): boolean;
  getIntersectingPickupIds(playerId: PlayerId): EntityId[];
  dispose(): void;
};

export function createPhysicsAdapter(options: PhysicsAdapterOptions): PhysicsAdapter {
  const gravity = options.gravity ?? ZERO_VECTOR;
  const world = new World(gravity);
  const playerShape = new Ball(options.rules.playerCollisionRadius);
  const playerRadius = options.rules.playerCollisionRadius;
  const arenaBody = world.createRigidBody(RigidBodyDesc.fixed());
  const playerBodies = new Map<PlayerId, PlayerBodyRecord>();
  const pickupColliders = new Map<EntityId, PickupColliderRecord>();
  const colliderKinds = new Map<number, ColliderKind>();
  const timeStepSeconds = 1 / options.rules.tickRate;
  let disposed = false;

  world.timestep = timeStepSeconds;
  world.lengthUnit = 1;
  createArenaBoundaries(world, arenaBody, options.arena, colliderKinds);
  createArenaStructures(world, arenaBody, options.arena, colliderKinds);

  return {
    step() {
      assertNotDisposed(disposed);
      world.step();
    },
    syncPlayer(state) {
      assertNotDisposed(disposed);
      const record =
        playerBodies.get(state.playerId) ??
        createPlayerBody(world, state.playerId, options.rules.playerCollisionRadius, colliderKinds);
      playerBodies.set(state.playerId, record);
      const velocity = state.velocity ?? ZERO_VECTOR;
      record.body.setTranslation(cloneVector(state.position), true);
      record.body.setNextKinematicTranslation(cloneVector(state.position));
      record.body.setLinvel(cloneVector(velocity), true);
      world.propagateModifiedBodyPositionsToColliders();
    },
    removePlayer(playerId) {
      assertNotDisposed(disposed);
      const record = playerBodies.get(playerId);
      if (!record) {
        return false;
      }

      colliderKinds.delete(record.collider.handle);
      world.removeRigidBody(record.body);
      playerBodies.delete(playerId);
      return true;
    },
    getPlayerPose(playerId) {
      assertNotDisposed(disposed);
      const record = playerBodies.get(playerId);
      if (!record) {
        return null;
      }

      return {
        position: cloneVector(record.body.translation()),
        velocity: cloneVector(record.body.linvel())
      };
    },
    movePlayer(playerId, desiredTranslation) {
      assertNotDisposed(disposed);
      const record = requirePlayerBody(playerBodies, playerId);
      const currentPosition = cloneVector(record.body.translation());
      const arenaMotion = resolveArenaMotion({
        currentPosition,
        desiredTranslation,
        arena: options.arena,
        collisionRadius: playerRadius,
        boundsPadding: playerRadius
      });
      const constrainedTranslation = subtractVector(
        arenaMotion.nextPosition,
        currentPosition
      );
      const hit = findClosestMotionBlocker({
        playerId,
        currentPosition,
        desiredTranslation: constrainedTranslation,
        playerRadius,
        playerBodies
      });
      const travelFraction =
        hit === null
          ? 1
          : Math.max(0, Math.min(1, hit.timeOfImpact - MOTION_SAFETY_MARGIN));
      const nextPosition =
        hit === null
          ? arenaMotion.nextPosition
          : addScaledVector(currentPosition, constrainedTranslation, travelFraction);
      const nextVelocity = scaleVector(desiredTranslation, 1 / timeStepSeconds);

      record.body.setNextKinematicTranslation(nextPosition);
      record.body.setTranslation(nextPosition, true);
      record.body.setLinvel(nextVelocity, true);
      world.propagateModifiedBodyPositionsToColliders();

      return {
        nextPosition,
        blocked: arenaMotion.blocked || travelFraction < 1,
        blockingActorId: hit?.blockingActorId ?? null
      };
    },
    syncPickup(state) {
      assertNotDisposed(disposed);
      const record =
        pickupColliders.get(state.pickupId) ??
        createPickupCollider(world, state.pickupId, options.rules.pickup.collisionRadius, colliderKinds);
      pickupColliders.set(state.pickupId, record);
      record.collider.setTranslation(cloneVector(state.position));
      record.collider.setEnabled(state.active);
    },
    removePickup(pickupId) {
      assertNotDisposed(disposed);
      const record = pickupColliders.get(pickupId);
      if (!record) {
        return false;
      }

      colliderKinds.delete(record.collider.handle);
      world.removeCollider(record.collider, false);
      pickupColliders.delete(pickupId);
      return true;
    },
    getIntersectingPickupIds(playerId) {
      assertNotDisposed(disposed);
      const record = requirePlayerBody(playerBodies, playerId);
      const pickupIds = new Set<EntityId>();
      const playerPosition = record.body.translation();

      for (const [pickupId, pickup] of pickupColliders) {
        if (!pickup.collider.isEnabled()) {
          continue;
        }

        if (
          playerShape.intersectsShape(
            playerPosition,
            IDENTITY_ROTATION,
            pickup.collider.shape,
            pickup.collider.translation(),
            pickup.collider.rotation()
          )
        ) {
          pickupIds.add(pickupId);
        }
      }

      return [...pickupIds].sort();
    },
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      playerBodies.clear();
      pickupColliders.clear();
      colliderKinds.clear();
      world.free();
    }
  };
}

function createArenaBoundaries(
  world: World,
  body: ReturnType<World["createRigidBody"]>,
  arena: ArenaLayout,
  colliderKinds: Map<number, ColliderKind>
): Array<ReturnType<World["createCollider"]>> {
  const halfWidth = arena.bounds.width / 2;
  const halfHeight = arena.bounds.height / 2;
  const halfDepth = arena.bounds.depth / 2;
  const colliders: Array<ReturnType<World["createCollider"]>> = [];

  const boundaries = [
    ColliderDesc.cuboid(halfWidth, ARENA_BOUNDARY_OFFSET, halfDepth).setTranslation(
      0,
      -ARENA_BOUNDARY_OFFSET,
      0
    ),
    ColliderDesc.cuboid(halfWidth, ARENA_BOUNDARY_OFFSET, halfDepth).setTranslation(
      0,
      arena.bounds.height + ARENA_BOUNDARY_OFFSET,
      0
    ),
    ColliderDesc.cuboid(ARENA_BOUNDARY_OFFSET, halfHeight, halfDepth).setTranslation(
      halfWidth + ARENA_BOUNDARY_OFFSET,
      halfHeight,
      0
    ),
    ColliderDesc.cuboid(ARENA_BOUNDARY_OFFSET, halfHeight, halfDepth).setTranslation(
      -(halfWidth + ARENA_BOUNDARY_OFFSET),
      halfHeight,
      0
    ),
    ColliderDesc.cuboid(halfWidth, halfHeight, ARENA_BOUNDARY_OFFSET).setTranslation(
      0,
      halfHeight,
      halfDepth + ARENA_BOUNDARY_OFFSET
    ),
    ColliderDesc.cuboid(halfWidth, halfHeight, ARENA_BOUNDARY_OFFSET).setTranslation(
      0,
      halfHeight,
      -(halfDepth + ARENA_BOUNDARY_OFFSET)
    )
  ];

  for (const boundary of boundaries) {
    const collider = world.createCollider(boundary, body);
    colliders.push(collider);
    colliderKinds.set(collider.handle, {
      type: "arena",
      actorId: null
    });
  }

  return colliders;
}

function createArenaStructures(
  world: World,
  body: ReturnType<World["createRigidBody"]>,
  arena: ArenaLayout,
  colliderKinds: Map<number, ColliderKind>
): Array<ReturnType<World["createCollider"]>> {
  const colliders: Array<ReturnType<World["createCollider"]>> = [];

  for (const structure of arena.structures) {
    const collider = world.createCollider(
      ColliderDesc.cuboid(
        structure.size.width / 2,
        structure.size.height / 2,
        structure.size.depth / 2
      ).setTranslation(
        structure.position.x,
        structure.position.y,
        structure.position.z
      ),
      body
    );
    colliders.push(collider);
    colliderKinds.set(collider.handle, {
      type: "arena",
      actorId: null
    });
  }

  return colliders;
}

function createPlayerBody(
  world: World,
  playerId: PlayerId,
  radius: number,
  colliderKinds: Map<number, ColliderKind>
): PlayerBodyRecord {
  const body = world.createRigidBody(
    RigidBodyDesc.kinematicPositionBased()
      .setTranslation(0, 0, 0)
      .enabledRotations(false, false, false)
      .setGravityScale(0)
  );
  const collider = world.createCollider(ColliderDesc.ball(radius).setDensity(0), body);
  colliderKinds.set(collider.handle, {
    type: "player",
    actorId: playerId
  });

  return {
    body,
    collider
  };
}

function createPickupCollider(
  world: World,
  pickupId: EntityId,
  radius: number,
  colliderKinds: Map<number, ColliderKind>
): PickupColliderRecord {
  const collider = world.createCollider(
    ColliderDesc.ball(radius).setSensor(true).setDensity(0)
  );
  colliderKinds.set(collider.handle, {
    type: "pickup",
    actorId: pickupId
  });

  return {
    collider
  };
}

function requirePlayerBody(
  playerBodies: ReadonlyMap<PlayerId, PlayerBodyRecord>,
  playerId: PlayerId
): PlayerBodyRecord {
  const record = playerBodies.get(playerId);
  if (!record) {
    throw new Error(`missing physics player: ${playerId}`);
  }

  return record;
}

function findClosestMotionBlocker(options: {
  playerId: PlayerId;
  currentPosition: Vector3;
  desiredTranslation: Vector3;
  playerRadius: number;
  playerBodies: ReadonlyMap<PlayerId, PlayerBodyRecord>;
}):
  | {
      timeOfImpact: number;
      blockingActorId: PlayerId | null;
    }
  | null {
  let closestHit:
    | {
        timeOfImpact: number;
        blockingActorId: PlayerId | null;
      }
    | null = null;

  for (const [otherPlayerId, otherPlayer] of options.playerBodies) {
    if (otherPlayerId === options.playerId) {
      continue;
    }

    const hit = findSphereSweepImpactFraction(
      options.currentPosition,
      options.desiredTranslation,
      otherPlayer.body.translation(),
      options.playerRadius * 2
    );
    if (hit !== null && (closestHit === null || hit < closestHit.timeOfImpact)) {
      closestHit = {
        timeOfImpact: hit,
        blockingActorId: otherPlayerId
      };
    }
  }

  return closestHit;
}

function findSphereSweepImpactFraction(
  currentPosition: Vector3,
  desiredTranslation: Vector3,
  blockerPosition: Vector3,
  combinedRadius: number
): number | null {
  const offset = subtractVector(currentPosition, blockerPosition);
  const a = dotVector(desiredTranslation, desiredTranslation);
  const b = 2 * dotVector(offset, desiredTranslation);
  const c = dotVector(offset, offset) - combinedRadius ** 2;

  if (a === 0) {
    return c <= 0 ? 0 : null;
  }

  const discriminant = b ** 2 - 4 * a * c;
  if (discriminant < 0) {
    return null;
  }

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const nearRoot = (-b - sqrtDiscriminant) / (2 * a);
  const farRoot = (-b + sqrtDiscriminant) / (2 * a);

  if (nearRoot >= 0 && nearRoot <= 1) {
    return nearRoot;
  }

  if (c <= 0) {
    return Math.max(0, Math.min(1, farRoot));
  }

  return null;
}

function addScaledVector(base: Vector3, delta: Vector3, scale: number): Vector3 {
  return {
    x: base.x + delta.x * scale,
    y: base.y + delta.y * scale,
    z: base.z + delta.z * scale
  };
}

function scaleVector(value: Vector3, scale: number): Vector3 {
  return {
    x: value.x * scale,
    y: value.y * scale,
    z: value.z * scale
  };
}

function subtractVector(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z
  };
}

function dotVector(left: Vector3, right: Vector3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function cloneVector(value: Vector3): Vector3 {
  return {
    x: value.x,
    y: value.y,
    z: value.z
  };
}

function assertNotDisposed(disposed: boolean): void {
  if (disposed) {
    throw new Error("physics adapter has been disposed");
  }
}
