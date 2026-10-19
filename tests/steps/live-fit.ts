/**
 * Step 19 — Live-Sample Fit (profile CASTLE-22). Added 2026-09-26, the Duel Crash Step 18 pattern.
 *
 * INFORMATIONAL AND VERDICT-LIGHT BY DESIGN. 1,350 captured rounds are too few to prove a distribution —
 * Step 5's recomputation of every round, Step 13's exact tier probabilities and the 5,000,000-round
 * simulation (Step 14) do that — but a scored step whose statistics REACT to the live sample means a
 * corrupted or reordered sample cannot pass silently. Every test at the Bonferroni level
 * LIVE_FIT_ALPHA / (number of tests):
 *
 *  1. WHEEL POSITIONS vs the 48-position wheel, one χ² (df 47) on the served result.position of every
 *     round (Step 5 proves it equals the recomputation). Expected counts use the EXACT per-position
 *     probability of the declared reduction (leading uint32 mod 48: positions 0–15 receive one extra value
 *     of 2^32 — src/rng.ts drawBiasBound), not 1/48.
 *  2. WIN RATES per coin tier vs the binomial: the rounds that bet on each tier, P(win) = the exact
 *     probability mass of that tier's positions under the same reduction; two-sided exact binomial.
 *
 * A deviation turns the step to INFO — never to FLAG or FAIL: profile policy INFORMATIONAL (Mike
 * 2026-09-29), reported, never counted, verdict unchanged. The measured statistics live in `data`; the
 * sentence states the bounds.
 */

import type { VerifyContext, StepResult } from './context';
import { RANGE, PAYOUT_TABLE, DRAW_HEX_CHARS } from '../../src/rng';
import { chiSquaredPValue } from '../../src/stats';
import { EXPECTED_ROUNDS, EXPECTED_COIN_TIERS, LIVE_FIT_ALPHA } from '../../src/loader';

/** Coin tier name → the multiplier it pays (the served request.coin vocabulary). */
const COIN_MULTIPLIER: Readonly<Record<string, number>> =
  Object.freeze({ two: 2, four: 4, eight: 8, sixteen: 16, twenty_four: 24, forty_eight: 48 });

function logPmf(k: number, n: number, p: number): number {
  let l = 0;
  for (let i = 0; i < k; i++) l += Math.log(n - i) - Math.log(i + 1);
  return l + k * Math.log(p) + (n - k) * Math.log(1 - p);
}

/** Two-sided exact binomial p-value: 2 × min(P(X ≤ k), P(X ≥ k)), capped at 1. */
function twoSidedBinomial(k: number, n: number, p: number): number {
  let lower = 0, upper = 0;
  for (let i = 0; i <= n; i++) {
    const v = Math.exp(logPmf(i, n, p));
    if (i <= k) lower += v;
    if (i >= k) upper += v;
  }
  return Math.min(1, 2 * Math.min(lower, upper));
}

export function run(ctx: VerifyContext): StepResult[] {
  const { rounds } = ctx;
  const domain = 2 ** (4 * DRAW_HEX_CHARS);
  const base = Math.floor(domain / RANGE);
  const rem = domain % RANGE;
  const pPos = Array.from({ length: RANGE }, (_, i) => (i < rem ? base + 1 : base) / domain);

  const nTests = 1 + EXPECTED_COIN_TIERS.length;
  const alpha = LIVE_FIT_ALPHA / nTests;
  const problems: string[] = [];
  if (rounds.length !== EXPECTED_ROUNDS) problems.push(`${rounds.length} rounds, ${EXPECTED_ROUNDS} declared`);

  // ── 1. Wheel positions ──────────────────────────────────────────────────────────────────────────
  const counts = new Array(RANGE).fill(0);
  let outOfRange = 0;
  for (const r of rounds) {
    const pos = r.result.position;
    if (!Number.isInteger(pos) || pos < 0 || pos >= RANGE) { outOfRange++; continue; }
    counts[pos]++;
  }
  if (outOfRange > 0) problems.push(`${outOfRange} round(s) with a position outside 0..${RANGE - 1}`);
  const n = rounds.length;
  const chi2 = counts.reduce((s, o, i) => s + (o - n * pPos[i]) ** 2 / (n * pPos[i]), 0);
  const df = RANGE - 1;
  const positionP = chiSquaredPValue(chi2, df);
  if (positionP < alpha) problems.push(`wheel positions χ² p below ${alpha}`);

  // ── 2. Win rate per coin tier ───────────────────────────────────────────────────────────────────
  const tiers: Record<string, { n: number; wins: number; pWin: number; p: number }> = {};
  for (const coin of EXPECTED_COIN_TIERS) {
    const mult = COIN_MULTIPLIER[coin];
    const pWin = PAYOUT_TABLE.reduce((s, t, i) => s + (t.multiplier === mult ? pPos[i] : 0), 0);
    const g = rounds.filter(r => r.request.coin === coin);
    const wins = g.filter(r => r.result.isWin === true).length;
    const p = g.length ? twoSidedBinomial(wins, g.length, pWin) : 0;
    tiers[coin] = { n: g.length, wins, pWin, p };
    if (mult === undefined || pWin === 0) problems.push(`coin tier ${coin} has no positions on the wheel`);
    else if (g.length === 0) problems.push(`coin tier ${coin}: no rounds`);
    else if (p < alpha) problems.push(`coin tier ${coin} win rate p below ${alpha}`);
  }

  const ok = problems.length === 0;
  return [{
    step:   19,
    name:   'Live-Sample Fit (informational, CASTLE-22)',
    status: ok ? 'PASS' : 'INFO',
    detail: ok
      ? `the ${n} live rounds' wheel positions fit the 48-position wheel under the exact reduction probabilities (χ², df ${df}) and the win rates of the ${EXPECTED_COIN_TIERS.length} coin tiers fit the binomial (two-sided exact); all ${nTests} tests p ≥ ${alpha} (Bonferroni ${LIVE_FIT_ALPHA}/${nTests}); informational — the distribution is proven by Steps 5, 13 and 14. Statistics in this step's data block.`
      : `live-sample deviation (INFO, informational — reported, not counted, verdict unchanged): ${problems.join('; ')}`,
    data:   { tests: nTests, alpha, positions: { n, chi2, df, p: positionP }, tiers },
  }];
}
