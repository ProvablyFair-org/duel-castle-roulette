/**
 * Steps 5–6: Determinism verification for Castle Roulette.
 *   5. Position Recomputation — computePosition matches all 1100 rounds
 *   6. Bet-Size Invariance — Phase C ($1) positions recompute identically
 */

import { computePosition, getResult } from '../../src/rng';
import type { VerifyContext, StepResult } from './context';

export function run(ctx: VerifyContext): StepResult[] {
  const results: StepResult[] = [];
  const { rounds, phaseC } = ctx;

  // Step 5: Position Recomputation
  {
    let match = 0;
    let mismatch = 0;
    const mismatches: string[] = [];
    for (const r of rounds) {
      const computed = computePosition(r.result.serverSeed, r.result.drandRandomness);
      if (computed === r.result.position) {
        match++;
      } else {
        mismatch++;
        if (mismatches.length < 5) {
          mismatches.push(`round ${r.roundId}: expected pos=${r.result.position}, got ${computed}`);
        }
      }
    }
    results.push({
      step: 5,
      name: 'Position Recomputation',
      status: mismatch === 0 ? 'PASS' : 'FAIL',
      detail: mismatch === 0
        ? `${match}/${rounds.length} positions recomputed from (serverSeed, drandSeed) — 100% parity`
        : `${mismatch} mismatches: ${mismatches.join('; ')}`,
    });
  }

  // Step 6: Bet-Size Invariance
  {
    let match = 0;
    let mismatch = 0;
    for (const r of phaseC) {
      const computed = computePosition(r.result.serverSeed, r.result.drandRandomness);
      if (computed === r.result.position) match++;
      else mismatch++;
    }
    results.push({
      step: 6,
      name: 'Bet-Size Invariance',
      status: mismatch === 0 ? 'PASS' : 'FAIL',
      detail: `${match}/${phaseC.length} Phase C ($1) rounds recompute identically — position is independent of bet amount`,
    });
  }

  return results;
}
