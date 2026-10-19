/**
 * Step 17: Configuration Coverage — coin tiers and wheel positions
 *
 * Castle Roulette has one configuration dimension: the coin the player backs, one of six
 * colour tiers paying 2×, 4×, 8×, 16×, 24× and 48×. Everything else in the suite verifies
 * the MAPPING and the FORMULA — position to colour, colour to multiplier, probability to
 * expectation — and those are exhaustive by construction, so they say nothing about
 * whether the live capture actually exercised the dimension. A capture that only ever
 * backed the 2× coin would satisfy all of them.
 *
 * This step measures the span on both axes and holds each to a floor:
 *   · every declared coin tier must carry at least MIN_ROUNDS_PER_COIN_TIER rounds;
 *   · the wheel's payout cells are its 48 positions, and the step names any the capture
 *     never landed on.
 *
 * It also checks the claim it makes about an unlanded position — that it carries no
 * unverified return, because the expectation is exactly 1.0 on every tier. That is
 * measured here from the uint32 modulo mapping rather than taken on Step 13's word: a
 * step that asserts something it has not checked is decoration.
 */

import { getResult, RANGE } from '../../src/rng';
import type { VerifyContext, StepResult } from './context';
import {
  EXPECTED_COIN_TIERS, MIN_ROUNDS_PER_COIN_TIER, WHEEL_POSITIONS,
} from '../../src/loader';

export function run(ctx: VerifyContext): StepResult[] {
  const { rounds } = ctx;

  const perTier: Record<string, number> = {};
  for (const r of rounds) perTier[r.request.coin] = (perTier[r.request.coin] ?? 0) + 1;

  const failures: string[] = [];
  for (const tier of EXPECTED_COIN_TIERS) {
    const n = perTier[tier] ?? 0;
    if (n < MIN_ROUNDS_PER_COIN_TIER) {
      failures.push(`coin '${tier}': ${n} rounds (floor ${MIN_ROUNDS_PER_COIN_TIER})`);
    }
  }
  const declared = new Set(EXPECTED_COIN_TIERS);
  for (const k of Object.keys(perTier)) {
    if (!declared.has(k)) failures.push(`coin '${k}' appears in the data but is not a declared tier in src/loader.ts`);
  }

  const landed = new Set(rounds.map(r => r.result.position));
  const neverLanded: number[] = [];
  for (let p = 0; p < WHEEL_POSITIONS; p++) if (!landed.has(p)) neverLanded.push(p);

  // Expectation is 1.0 on every tier, which is what makes an unlanded position
  // uninteresting. Measure it rather than assert it.
  const total = 2 ** 32;
  // Derived bound, same as Step 13: every tier has positions × multiplier = RANGE, so on a uint32
  // modulo mapping no tier's expectation can depart from 1.0 by more than RANGE / 2^32.
  const EV_BOUND = RANGE / 2 ** 32;
  const base = Math.floor(total / RANGE);
  const remainder = total % RANGE;
  const evByMultiplier: Record<string, number> = {};
  let maxEvDeviation = 0;
  for (let p = 0; p < WHEEL_POSITIONS; p++) {
    const mult = getResult(p).multiplier;
    const key = `${mult}x`;
    evByMultiplier[key] = (evByMultiplier[key] ?? 0) + ((p < remainder ? base + 1 : base) / total) * mult;
  }
  for (const [key, ev] of Object.entries(evByMultiplier)) {
    const dev = Math.abs(ev - 1.0);
    if (dev > maxEvDeviation) maxEvDeviation = dev;
    if (dev > EV_BOUND) {
      failures.push(`tier ${key}: expectation departs from 1.0 by ${dev.toExponential(4)}, beyond the RANGE/2^32 = ${EV_BOUND.toExponential(4)} bound — unlanded positions cannot be dismissed as carrying no unverified return`);
    }
  }

  // MEASURED, not asserted. The share of the paytable's total return (Σ over all 48 positions of
  // P(position) × multiplier) that sits on positions live play never landed on. It was a
  // hard-coded 0, which would have printed 0 over a capture that missed half the wheel.
  let returnAll = 0;
  let returnUnlanded = 0;
  for (let p = 0; p < WHEEL_POSITIONS; p++) {
    const r = ((p < remainder ? base + 1 : base) / total) * getResult(p).multiplier;
    returnAll += r;
    if (!landed.has(p)) returnUnlanded += r;
  }
  const unverifiedRTPShare = returnAll > 0 ? returnUnlanded / returnAll : NaN;

  const ok = failures.length === 0;
  return [{
    step: 17,
    name: 'Configuration Coverage (coin tiers and wheel positions)',
    status: ok ? 'PASS' : 'FAIL',
    detail: ok
      ? `All ${EXPECTED_COIN_TIERS.length} declared coin tiers carry at least the ${MIN_ROUNDS_PER_COIN_TIER}-round floor from src/loader.ts, and no undeclared tier appears in the data. `
        + `Wheel coverage: ${WHEEL_POSITIONS - neverLanded.length} of ${WHEEL_POSITIONS} positions landed on by live play`
        + `${neverLanded.length === 0 ? ' — every payout cell exercised' : `; the ${neverLanded.length} unlanded positions are named in this step's data block`}. `
        + `Expectation measured at 1.0 within the RANGE/2^32 = ${EV_BOUND.toExponential(4)} bound on every tier, so no unverified return sits on an unlanded position.`
      : `${failures.length} coverage failures: ${failures.slice(0, 5).join('; ')}`,
    data: {
      declaredTiers: [...EXPECTED_COIN_TIERS],
      minRoundsPerTier: MIN_ROUNDS_PER_COIN_TIER,
      roundsPerTier: perTier,
      wheelPositions: WHEEL_POSITIONS,
      positionsLanded: WHEEL_POSITIONS - neverLanded.length,
      neverLandedPositions: neverLanded,
      evBound: EV_BOUND,
      expectationByMultiplier: evByMultiplier,
      maxEvDeviation,
      unverifiedRTPShare,
      note: 'unverifiedRTPShare = share of the paytable\'s total return (Σ P(position) × multiplier '
          + 'over all 48 positions) sitting on positions live play never landed on, computed from '
          + 'neverLandedPositions. Expectation is 1.0 on every colour tier, so a position the capture '
          + 'never landed on carries no unverified return — only no live observation of it.',
      failures,
    },
  }];
}
