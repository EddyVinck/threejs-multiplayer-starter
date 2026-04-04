import { arenaLayoutSchema, type ArenaLayout } from "./simulation.js";

const HALF_TURN_RADIANS = Math.PI;
const QUARTER_TURN_RADIANS = Math.PI / 2;

export const defaultSampleArenaLayout: ArenaLayout = arenaLayoutSchema.parse({
  bounds: {
    width: 28,
    height: 10,
    depth: 28
  },
  playerSpawns: [
    {
      spawnId: "spawn-northwest",
      position: { x: -10, y: 1, z: -10 },
      yaw: QUARTER_TURN_RADIANS / 2
    },
    {
      spawnId: "spawn-northeast",
      position: { x: 10, y: 1, z: -10 },
      yaw: -QUARTER_TURN_RADIANS / 2
    },
    {
      spawnId: "spawn-southeast",
      position: { x: 10, y: 1, z: 10 },
      yaw: HALF_TURN_RADIANS + QUARTER_TURN_RADIANS / 2
    },
    {
      spawnId: "spawn-southwest",
      position: { x: -10, y: 1, z: 10 },
      yaw: HALF_TURN_RADIANS - QUARTER_TURN_RADIANS / 2
    }
  ],
  pickupSpawns: [
    {
      pickupId: "pickup-center-north",
      position: { x: 0, y: 1, z: -6 },
      kind: "score-orb"
    },
    {
      pickupId: "pickup-center-south",
      position: { x: 0, y: 1, z: 6 },
      kind: "score-orb"
    },
    {
      pickupId: "pickup-center-east",
      position: { x: 6, y: 1, z: 0 },
      kind: "score-orb"
    },
    {
      pickupId: "pickup-center-west",
      position: { x: -6, y: 1, z: 0 },
      kind: "score-orb"
    },
    {
      pickupId: "pickup-sky-center",
      position: { x: 0, y: 4, z: 0 },
      kind: "score-orb"
    }
  ],
  structures: [
    {
      structureId: "structure-center-platform",
      position: { x: 0, y: 1.25, z: 0 },
      size: {
        width: 8,
        height: 2.5,
        depth: 8
      }
    },
    {
      structureId: "structure-north-cover",
      position: { x: 0, y: 1.25, z: -10 },
      size: {
        width: 6,
        height: 2.5,
        depth: 2
      }
    },
    {
      structureId: "structure-south-cover",
      position: { x: 0, y: 1.25, z: 10 },
      size: {
        width: 6,
        height: 2.5,
        depth: 2
      }
    },
    {
      structureId: "structure-east-cover",
      position: { x: 10, y: 1.25, z: 0 },
      size: {
        width: 2,
        height: 2.5,
        depth: 6
      }
    },
    {
      structureId: "structure-west-cover",
      position: { x: -10, y: 1.25, z: 0 },
      size: {
        width: 2,
        height: 2.5,
        depth: 6
      }
    }
  ]
});
