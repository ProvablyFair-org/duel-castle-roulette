/**
 * Simulation seed schedule — shared by src/simulate.ts (the producer) and tests/steps/simulation.ts
 * (Steps 14–15, which REPLAY from it).
 *
 * Every input the simulation consumes is derived here from MASTER_SEED, or from the pinned dataset.
 * Keeping the derivation in one module is what lets the verifier regenerate the simulator's inputs
 * instead of trusting the numbers the simulator wrote down: the same function the producer called
 * is the one the verifier calls, and the verifier compares what it gets with the artifact.
 */

import * as crypto from 'crypto';
import { computePositionFromBuffer, RANGE } from './rng';

export const MASTER_SEED = 'castle-roulette-audit-simulation-2026-04-23';

export const PASS1_STREAMS      = 10;
export const PASS1_ROUNDS_EACH  = 500_000;
export const PASS1_ROUNDS_TOTAL = PASS1_STREAMS * PASS1_ROUNDS_EACH; // 5,000,000
export const PASS2_NONCES       = 10_000;
/** The framework floor for Pass 2: at least 10,000 values per revealed seed (Framework C-08). Step 15
 *  FAILs when PASS2_NONCES is below it. Raised from 1,000 to 10,000 on 2026-10-23 (v1.3.0). */
export const PASS2_NONCES_FLOOR = 10_000;
/** v1.0.0–v1.2.1 drew 1,000 values per seed. Since v1.3.0 those are each seed's first 1,000, unchanged. */
export const PASS2_NONCES_V1    = 1_000;
/** Cumulative round marks of the Pass-1 convergence series (moved here from src/simulate.ts on
 *  2026-09-26, values unchanged, so Step 14 replays the series from the same declaration). */
export const PASS1_CONVERGENCE_POINTS: readonly number[] =
  Object.freeze([1000, 5000, 10000, 50000, 100000, 500000, 1000000, 2000000, 5000000]);

export function deterministicSeed(index: number, prefix: string): string {
  return crypto.createHmac('sha256', MASTER_SEED).update(`${prefix}:${index}`).digest('hex');
}

/** Pass 1, stream `s`, round `i`: the wheel position the simulator drew. */
export function pass1Position(s: number, i: number): number {
  const serverSeed = deterministicSeed(i, `server-stream-${s}`);
  const drandSeed = deterministicSeed(i, `drand-stream-${s}`) + deterministicSeed(i, `drand2-stream-${s}`).slice(0, 32);
  return computePositionFromBuffer(Buffer.from(serverSeed, 'hex'), drandSeed);
}

/**
 * Pass 2: the simulated beacon value (derived from MASTER_SEED, not a drand round) used for casino seed `s`, value `n` (0 ≤ n < PASS2_NONCES).
 *
 * Values 0–999 are the v1.0.0–v1.2.1 schedule, unchanged: index s × 1,000 + n under the labels
 * `p2drand` / `p2drand2`. Values 1,000–9,999, added on 2026-10-23 (v1.3.0), come from the same
 * MASTER_SEED and the same HMAC-SHA256 derivation under the labels `p2drand-ext` / `p2drand2-ext`, at
 * index s × 9,000 + (n − 1,000). The labels keep the two ranges apart, and the index keeps the seeds
 * apart, so no value is reused between ranges or between seeds, and a replay of the first 1,000 values
 * per seed is the v1.2.1 run exactly.
 */
export function pass2Drand(s: number, n: number): string {
  if (n < PASS2_NONCES_V1) {
    const i = s * PASS2_NONCES_V1 + n;
    return deterministicSeed(i, 'p2drand') + deterministicSeed(i, 'p2drand2').slice(0, 32);
  }
  const i = s * (PASS2_NONCES - PASS2_NONCES_V1) + (n - PASS2_NONCES_V1);
  return deterministicSeed(i, 'p2drand-ext') + deterministicSeed(i, 'p2drand2-ext').slice(0, 32);
}

/** Per-position counts of one Pass-1 stream, regenerated from the schedule. */
export function replayPass1Stream(s: number): number[] {
  const observed = new Array(RANGE).fill(0);
  for (let i = 0; i < PASS1_ROUNDS_EACH; i++) observed[pass1Position(s, i)]++;
  return observed;
}
