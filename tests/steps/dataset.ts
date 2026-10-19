/**
 * Steps 11–13: Dataset integrity for Castle Roulette.
 *  11. Dataset Hash — SHA-256 guard (recorded from pre-flight)
 *  12. drand Chain Formula — verify drandPublishedAt matches quicknet formula
 *  13. Anti-Circularity — independent probability verification (1/48 uniform)
 */

import { RANGE, PAYOUT_TABLE } from '../../src/rng';
import type { VerifyContext, StepResult } from './context';
import { checkDatasetHash, EXPECTED_ROUNDS } from '../../src/loader';

const QUICKNET_GENESIS = 1692803367;
const QUICKNET_PERIOD  = 3;

export function run(ctx: VerifyContext): StepResult[] {
  const results: StepResult[] = [];
  const { rounds } = ctx;

  // Step 11: Dataset Hash
  {
    const h = checkDatasetHash();
    results.push({
      step: 11,
      name: 'Dataset Hash',
      status: h.match ? 'PASS' : 'FAIL',
      detail: h.match
        ? 'SHA-256 of the dataset matches the pin in src/loader.ts'
        : `SHA-256 of the dataset ${h.actual} does not match the pin ${h.expected || '(empty)'} in src/loader.ts`,
      data: { expected: h.expected, actual: h.actual, match: h.match },
    });
  }

  // Step 12: drand Chain Formula Verification
  // Bound to the declared population: with one round, "0 mismatches" was free.
  {
    let match = 0;
    const mismatches: string[] = [];
    for (const r of rounds) {
      const expected = QUICKNET_GENESIS + (r.result.drandRoundId - 1) * QUICKNET_PERIOD;
      if (r.timing.drandPublishedAt === expected) match++;
      else mismatches.push(`round ${r.roundId}: drandPublishedAt ${r.timing.drandPublishedAt} != ${expected}`);
    }
    const popIssues: string[] = [];
    if (match !== EXPECTED_ROUNDS) popIssues.push(`rounds matching the chain formula ${match} != ${EXPECTED_ROUNDS}`);

    const ok = mismatches.length === 0 && popIssues.length === 0;
    results.push({
      step: 12,
      name: 'drand Chain Formula',
      status: ok ? 'PASS' : 'FAIL',
      detail: ok
        ? `All ${EXPECTED_ROUNDS} rounds required by src/loader.ts: drandPublishedAt equals the quicknet chain formula, genesis + (round − 1) × 3s`
        : popIssues.length > 0
          ? `POPULATION MISMATCH vs src/loader.ts: ${popIssues.join('; ')}`
          : `${mismatches.length} drandPublishedAt values do not match the quicknet chain formula`,
      data: { matched: match, mismatched: mismatches.length, populationIssues: popIssues, failures: mismatches.slice(0, 10) },
    });
  }

  // Step 13: Anti-Circularity — Independent Probability Verification
  // Castle Roulette uses value % 48. With uint32 values:
  //   2^32 = 89478485 × 48 + 16
  //   Positions 0-15: P = 89478486 / 2^32
  //   Positions 16-47: P = 89478485 / 2^32
  // Verify each color tier's probability × multiplier = 1.000 — a baseline RTP of 100%
  // by construction, which is the wheel and paytable alone. Settlement-stage edge is a
  // separate layer and is not what this step measures.
  {
    const total = 2 ** 32;
    const base = Math.floor(total / RANGE);     // 89478485
    const remainder = total % RANGE;            // 16

    const tiers = [
      { name: 'Green (48×)',     positions: 1,  mult: 48, start: 0 },
      { name: 'Red (24×)',       positions: 2,  mult: 24, start: 1 },
      { name: 'Purple (16×)',    positions: 3,  mult: 16, start: 3 },
      { name: 'Blue (8×)',       positions: 6,  mult: 8,  start: 6 },
      { name: 'Grey (4×)',       positions: 12, mult: 4,  start: 12 },
      { name: 'Dark Blue (2×)',  positions: 24, mult: 2,  start: 24 },
    ];

    // EV_BOUND is DERIVED, not picked. Every tier has positions × multiplier = RANGE, and a uint32
    // modulo RANGE gives each position at most one extra outcome out of 2^32, so no tier's
    // expectation can depart from 1.0 by more than RANGE / 2^32 = 1.1176e-8 on an honest mapping.
    // The largest departure actually present is Green's 32 / 2^32 = 7.45e-9 (recorded as
    // maxEvDeviation). The former 1e-6 bound was ~134× the measured bias and would have admitted, for
    // example, a 26-bit mapping (Green 32 / 2^26 = 4.77e-7).
    const EV_BOUND = RANGE / 2 ** 32;   // the uint32 claim, stated independently of `total`
    const SUM_BOUND = 1e-10;
    const failures: string[] = [];
    const evByTier: Record<string, number> = {};
    const probByTier: Record<string, number> = {};
    let maxEvDeviation = 0;

    for (const tier of tiers) {
      // Compute exact probability for this tier's positions
      let tierProb = 0;
      for (let p = tier.start; p < tier.start + tier.positions; p++) {
        tierProb += (p < remainder ? base + 1 : base) / total;
      }
      const ev = tierProb * tier.mult;
      probByTier[tier.name] = tierProb;
      evByTier[tier.name] = ev;
      const dev = Math.abs(ev - 1.0);
      if (dev > maxEvDeviation) maxEvDeviation = dev;

      // EV should be very close to 1.000 — the baseline the paytable enforces
      if (dev > EV_BOUND) failures.push(`${tier.name}: P × multiplier departs from 1.0 beyond the ${EV_BOUND.toExponential(4)} bound (deviation ${dev.toExponential(4)})`);
    }

    // Also verify: sum of all probabilities = 1.0
    let totalProb = 0;
    for (let p = 0; p < RANGE; p++) {
      totalProb += (p < remainder ? base + 1 : base) / total;
    }
    if (Math.abs(totalProb - 1.0) > SUM_BOUND) {
      failures.push(`position probabilities sum to a value departing from 1.0 beyond the ${SUM_BOUND.toExponential(0)} bound`);
    }

    // NEGATIVE CONTROL (added 2026-09-26, profile CASTLE-18): the same identity must REJECT a
    // corrupted table — each tier's multiplier raised by one, in turn. A check that accepted any of
    // those six tables would be accepting a 2%–50% overpaying tier as fair.
    let negativeControlAccepted = 0;
    for (const tier of tiers) {
      let tierProb = 0;
      for (let p = tier.start; p < tier.start + tier.positions; p++) tierProb += (p < remainder ? base + 1 : base) / total;
      if (Math.abs(tierProb * (tier.mult + 1) - 1.0) <= EV_BOUND) negativeControlAccepted++;
    }
    if (negativeControlAccepted > 0) failures.push(`negative control: a corrupted table (multiplier + 1) was accepted on ${negativeControlAccepted} tier(s)`);

    // The per-tier expectations and the modulo-bias figure are measured floats and go in
    // `data`. The sentence carries the bounds — a string leaf cannot be tolerance-compared,
    // so a figure printed into prose disagrees forever on a machine whose last bit differs.
    const moduloBias = ((base + 1) / total) / (base / total) - 1;
    results.push({
      step: 13,
      name: 'Anti-Circularity (Baseline RTP by Construction)',
      status: failures.length === 0 ? 'PASS' : 'FAIL',
      detail: failures.length === 0
        ? `All 6 colour tiers verified from the uint32 modulo mapping alone: P × multiplier = 1.0 within the RANGE/2^32 = ${EV_BOUND.toExponential(4)} bound for every tier, and the 48 position probabilities sum to 1.0 within ${SUM_BOUND.toExponential(0)}; negative control (each tier's multiplier + 1) rejected on all ${tiers.length} tiers — a game-engine baseline RTP of 100% by construction, before any settlement-stage edge. Per-tier probabilities, expectations and the residual modulo bias are in this step's data block.`
        : `${failures.length} baseline-RTP failures: ${failures.slice(0, 3).join('; ')}`,
      data: {
        tiers: tiers.length,
        evBound: EV_BOUND,
        sumBound: SUM_BOUND,
        probabilityByTier: probByTier,
        expectationByTier: evByTier,
        maxEvDeviation,
        totalProbability: totalProb,
        moduloBiasPositions0to15: moduloBias,
        negativeControlAccepted,
        failures,
      },
    });
  }

  return results;
}
