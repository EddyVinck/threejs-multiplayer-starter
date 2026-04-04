import { describe, expect, it } from "vitest";

import { defaultSampleArenaLayout } from "./sample-arena.js";
import { resolveSampleModeConfig } from "./sample-mode.js";
import { defaultSimulationRules } from "./simulation.js";

describe("sample mode config", () => {
  it("resolves to the canonical sample arena and rules by default", () => {
    expect(resolveSampleModeConfig()).toEqual({
      arena: defaultSampleArenaLayout,
      rules: defaultSimulationRules
    });
  });

  it("accepts validated arena and rules overrides", () => {
    const overrides = resolveSampleModeConfig({
      arena: {
        bounds: {
          width: 10,
          height: 6,
          depth: 10
        },
        playerSpawns: [
          {
            spawnId: "spawn-a",
            position: { x: 0, y: 1, z: 0 },
            yaw: 0
          }
        ],
        pickupSpawns: [
          {
            pickupId: "pickup-a",
            position: { x: 2, y: 1, z: 0 },
            kind: "score-orb"
          }
        ],
        structures: []
      },
      rules: {
        ...defaultSimulationRules,
        tickRate: 30
      }
    });

    expect(overrides.arena.bounds.width).toBe(10);
    expect(overrides.rules.tickRate).toBe(30);
  });
});
