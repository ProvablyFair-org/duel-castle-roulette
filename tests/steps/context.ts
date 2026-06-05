import type { RouletteRound, StepResult, InfoItem } from '../../src/types';

export type { StepResult, InfoItem };

export interface VerifyContext {
  rounds:    RouletteRound[];
  phaseA:    RouletteRound[];
  phaseB:    RouletteRound[];
  phaseC:    RouletteRound[];
  outputsDir: string;
}
