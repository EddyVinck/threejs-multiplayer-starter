import {
  arenaLayoutSchema,
  defaultSimulationRules,
  simulationRulesSchema,
  type ArenaLayout,
  type SimulationRules
} from "./simulation.js";
import { defaultSampleArenaLayout } from "./sample-arena.js";

export type SampleModeConfig = {
  arena: ArenaLayout;
  rules: SimulationRules;
};

export const defaultSampleModeConfig: SampleModeConfig = {
  arena: defaultSampleArenaLayout,
  rules: defaultSimulationRules
};

export function resolveSampleModeConfig(
  overrides: Partial<SampleModeConfig> = {}
): SampleModeConfig {
  return {
    arena: arenaLayoutSchema.parse(
      overrides.arena ?? defaultSampleModeConfig.arena
    ),
    rules: simulationRulesSchema.parse(
      overrides.rules ?? defaultSampleModeConfig.rules
    )
  };
}
