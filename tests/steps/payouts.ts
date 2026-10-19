/**
 * Steps 7–10: Payout and game mechanics verification for Castle Roulette.
 *   7. Payout Math — amountWon correct for wins/losses
 *   8. Color-Position Mapping — winning coin matches position tier
 *   9. Settlement Edge Verification — derived from served settlement data: every round the
 *      RECOMPUTED tier wins must be credited stake × table multiplier exactly at 18 dp. The
 *      dataset's effectiveEdge is written by the capture script and is not scored; step 13
 *      carries the wheel's own baseline.
 *  10. Phase Coverage — 800 A + 200 B + 100 C = 1100
 */

import { getResult, PAYOUT_TABLE, RANGE, computePosition } from '../../src/rng';

/** How many disagreements a step names in its detail (a display cap, not a population). */
const MAX_LISTED = 5;
import type { VerifyContext, StepResult } from './context';
import { EXPECTED_ROUNDS, EXPECTED_PHASE_ROUNDS, EXPECTED_WINNING_ROUNDS } from '../../src/loader';

// MONEY IS A VALUE DOMAIN, NOT A TOLERANCE. Every figure below is a 2-decimal amount: measured
// over this capture (re-measured 2026-09-23 on the pinned dataset), 1,350/1,350 values of
// amountWon, amountCurrency and multiplier sit exactly on that grid. The previous comparison,
// `Math.abs(won - expected) < 0.000001`, admits a credit that is not a legal amount at all — the
// forgery that nudges a served payout by 1e-9 passes it, and did, on the sibling groomers-van
// audit. Comparing integer grid units leaves nothing to slip under.
const MONEY_DP  = 2;
const offGridM  = (x: number): number => Math.abs(x * 10 ** MONEY_DP - Math.round(x * 10 ** MONEY_DP));
// The slack absorbs IEEE-754 representation error in the scaling and nothing else, so it is sized
// RELATIVE to the magnitude of the scaled value rather than picked as a round number: a flat 1e-6
// here would be wider than the 1e-7 an off-grid 1e-9 nudge produces after ×100.
const slackM    = (x: number): number => Math.max(1e-9, Math.abs(x * 10 ** MONEY_DP) * 1e-12);
const onGridM   = (x: number): boolean => Number.isFinite(x) && offGridM(x) < slackM(x);
const unitsM    = (x: number): number => Math.round(x * 10 ** MONEY_DP);

export function run(ctx: VerifyContext): StepResult[] {
  const results: StepResult[] = [];
  const { rounds, phaseA, phaseB, phaseC } = ctx;

  // Step 7: Payout Math
  {
    let correct = 0;
    let wrong = 0;
    const errors: string[] = [];
    for (const r of rounds) {
      const amount = Math.abs(parseFloat(r.result.amountCurrency));
      const won = parseFloat(r.result.amountWon);
      const multiplier = parseFloat(r.result.multiplier);

      // The stake itself must be a legal amount before anything derived from it is compared.
      if (!onGridM(amount)) {
        wrong++;
        if (errors.length < 5) {
          errors.push(`round ${r.roundId}: amountCurrency ${r.result.amountCurrency} is not a legal ${MONEY_DP}-dp amount (off by ${offGridM(amount).toExponential(3)})`);
        }
        continue;
      }

      if (r.result.isWin) {
        // Win: amountWon should = bet × multiplier, the full baseline payout. Step 9 holds
        // the same credit to the table multiplier exactly at 18 dp on every recomputed win.
        // Compared on the money grid: the credit must be a legal 2-dp amount AND the same
        // number of grid units as the expected payout.
        const expected = amount * multiplier;
        if (onGridM(won) && unitsM(won) === unitsM(expected)) {
          correct++;
        } else if (!onGridM(won)) {
          wrong++;
          if (errors.length < 5) {
            errors.push(`round ${r.roundId}: amountWon ${r.result.amountWon} is not a legal ${MONEY_DP}-dp amount (off by ${offGridM(won).toExponential(3)})`);
          }
        } else {
          wrong++;
          if (errors.length < 5) {
            errors.push(`round ${r.roundId}: expected ${expected.toFixed(6)}, got ${won}`);
          }
        }
      } else {
        // Loss: amountWon = 0 — held to the same grid, so a 1e-9 credit on a loss is not
        // "zero" either.
        if (onGridM(won) && unitsM(won) === 0) {
          correct++;
        } else {
          wrong++;
          if (errors.length < 5) {
            errors.push(`round ${r.roundId}: loss but amountWon=${won}`);
          }
        }
      }
    }

    // isWin is capture-recorded (the capture script compares winningCoin with the coin bet); consistency only
    let isWinCorrect = 0;
    for (const r of rounds) {
      const posResult = getResult(r.result.position);
      const shouldWin = posResult.color === r.request.coin.replace('_', '_');
      // Map coin keys to color names
      const coinToColor: Record<string, string> = {
        two: 'dark_blue', four: 'grey', eight: 'blue',
        sixteen: 'purple', twenty_four: 'red', forty_eight: 'green',
      };
      const betColor = coinToColor[r.request.coin];
      const actuallyWins = posResult.color === betColor;
      if (r.result.isWin === actuallyWins) isWinCorrect++;
    }

    // Bound to the declared population: with zero rounds, "0 wrong" was a PASS.
    const ok = wrong === 0 && correct === EXPECTED_ROUNDS && isWinCorrect === EXPECTED_ROUNDS;
    results.push({
      step: 7,
      name: 'Payout Math',
      status: ok ? 'PASS' : 'FAIL',
      detail: ok
        ? `${correct}/${EXPECTED_ROUNDS} payouts verified — ${isWinCorrect}/${EXPECTED_ROUNDS} capture-recorded isWin flags agree with the tier`
        : wrong > 0
          ? `${wrong} payout errors: ${errors.join('; ')}`
          : `${correct} payouts verified and ${isWinCorrect} capture-recorded isWin flags agree with the tier; ${EXPECTED_ROUNDS} of each required by src/loader.ts`,
      data: { verified: correct, wrong, isWinCorrect, expected: EXPECTED_ROUNDS },
    });
  }

  // Step 8: Color-Position Mapping
  // HARDENED 2026-09-26 (profile CASTLE-10 / CASTLE-13). The step used to compare the served
  // winningCoin with the table at the SERVED position only. It now takes the position from the
  // RECOMPUTATION (src/rng.ts computePosition — Step 5 separately binds it to the served one) and
  // requires, on every round: the served position to equal it, the served winningCoin to name the
  // table's tier at that position, and the served 18-dp `multiplier` string to equal the table's
  // multiplier EXACTLY (parsed as an exact decimal, no tolerance) — so a served multiplier that is
  // not the declared table's value is caught even where the winning tier is right.
  {
    let match = 0;
    let mismatch = 0;
    const mismatchList: string[] = [];
    const coinToMult: Record<string, number> = {
      two: 2, four: 4, eight: 8, sixteen: 16, twenty_four: 24, forty_eight: 48,
    };
    const exactDecimalEquals = (s: string, m: number): boolean => {
      const mm = /^(\d+)(?:\.(\d+))?$/.exec(String(s));
      if (!mm) return false;
      const frac = mm[2] ?? '';
      return BigInt(mm[1] + frac) === BigInt(m) * 10n ** BigInt(frac.length);
    };
    for (const r of rounds) {
      const pos = computePosition(r.result.serverSeed, r.result.drandRandomness);
      const expected = getResult(pos);
      const ok = pos === r.result.position
        && coinToMult[r.result.winningCoin] === expected.multiplier
        && exactDecimalEquals(r.result.multiplier, expected.multiplier);
      if (ok) match++;
      else { mismatch++; if (mismatchList.length < MAX_LISTED) mismatchList.push(`round ${r.roundId}: recomputed position ${pos} is ${expected.multiplier}x; served position ${r.result.position}, winningCoin '${r.result.winningCoin}', multiplier ${r.result.multiplier}`); }
    }
    const ok = mismatch === 0 && match === EXPECTED_ROUNDS;
    results.push({
      step: 8,
      name: 'Color-Position Mapping',
      status: ok ? 'PASS' : 'FAIL',
      detail: ok
        ? `${match}/${EXPECTED_ROUNDS} — the RECOMPUTED position maps to the served winning tier, and the served multiplier equals the table's multiplier exactly, on every round`
        : mismatch > 0
          ? `${mismatch} mapping mismatches: ${mismatchList.join('; ')}`
          : `${match} rounds mapped; ${EXPECTED_ROUNDS} required by src/loader.ts`,
      data: { matched: match, mismatched: mismatch, expected: EXPECTED_ROUNDS },
    });
  }

  // Step 9: Settlement Edge Verification
  // REBASED 2026-10-04 (Mike's publish-blocker list). The step used to count result.effectiveEdge === 0,
  // but the capture script writes that field as the literal 0 (capture/castle-roulette-capture.reference.js
  // :158), so it measured the script, not Duel. Zero settlement-stage edge is now DERIVED from served
  // settlement data: a round is a win when the RECOMPUTED tier equals request.coin, and on every such
  // round the served credit (amountWon) must equal the served stake (−amountCurrency) × the table
  // multiplier EXACTLY at 18 dp (both from the transactions API, capture/castle-roulette-enrich.reference.js).
  // A multiplier reduction at settlement that moves a credit by 1e-18 or more fails here. effectiveEdge
  // is recorded in data, not scored.
  {
    let wins = 0;
    let exact = 0;
    const offList: string[] = [];
    const winsByServedStake: Record<string, number> = {};
    for (const r of rounds) {
      const tier = getResult(computePosition(r.result.serverSeed, r.result.drandRandomness));
      if (COIN_TO_COLOR[r.request.coin] !== tier.color) continue;
      wins++;
      const stakeKey = String(r.result.amountCurrency).replace(/^-/, '');
      winsByServedStake[stakeKey] = (winsByServedStake[stakeKey] ?? 0) + 1;
      const stake = units18(r.result.amountCurrency);
      const won = units18(r.result.amountWon);
      if (stake !== null && won !== null && stake < 0n && won === -stake * BigInt(tier.multiplier)) exact++;
      else if (offList.length < MAX_LISTED) offList.push(`round ${r.roundId}: credited ${r.result.amountWon} on stake ${r.result.amountCurrency} at ${tier.multiplier}x`);
    }
    const captureRecordedNonZero = rounds.filter(r => r.result.effectiveEdge !== 0).length;
    const ok = exact === wins && wins === EXPECTED_WINNING_ROUNDS;
    results.push({
      step: 9,
      name: 'Settlement Edge Verification',
      status: ok ? 'PASS' : 'FAIL',
      detail: ok
        ? `${exact}/${EXPECTED_WINNING_ROUNDS} winning rounds (on the recomputed tier; count declared in src/loader.ts) credited exactly stake × table multiplier at 18 dp from the served amountWon and amountCurrency: zero settlement-stage edge at both captured stakes ($0.01 and $1.00). No stake above $1.00 was captured. The capture-recorded effectiveEdge field is not scored. The wheel's own baseline is step 13.`
        : wins !== EXPECTED_WINNING_ROUNDS
          ? `POPULATION MISMATCH vs src/loader.ts: ${wins} winning rounds on the recomputed tier, ${EXPECTED_WINNING_ROUNDS} declared`
          : `${wins - exact} winning rounds not credited at the full multiplier: ${offList.join('; ')}`,
      data: { wins, exactFullMultiplier: exact, expected: EXPECTED_WINNING_ROUNDS, winsByServedStake, captureRecordedEffectiveEdgeNonZero: captureRecordedNonZero },
    });
  }

  // Step 10: Phase Coverage
  // The expected counts used to be inlined here, out of reach of every other step. They
  // live in src/loader.ts now, beside the dataset pin, where the rest of the suite reads
  // them too — one declared population rather than one per file. The dataset also carries
  // its own counts in meta.enrichment; those are the file describing itself and are not
  // what this step compares against.
  {
    const counts: Record<string, number> = {
      A: phaseA.length,
      B: phaseB.length,
      C: phaseC.length,
      D: rounds.filter(r => r.phase === 'D').length,
      E: rounds.filter(r => r.phase === 'E').length,
    };
    const popIssues: string[] = [];
    for (const [p, n] of Object.entries(EXPECTED_PHASE_ROUNDS)) {
      if ((counts[p] ?? 0) !== n) popIssues.push(`phase ${p} ${counts[p] ?? 0} != ${n}`);
    }
    if (rounds.length !== EXPECTED_ROUNDS) popIssues.push(`rounds ${rounds.length} != ${EXPECTED_ROUNDS}`);

    results.push({
      step: 10,
      name: 'Phase Coverage',
      status: popIssues.length === 0 ? 'PASS' : 'FAIL',
      detail: popIssues.length === 0
        ? `${rounds.length} rounds across phases A, B, C, D and E exactly as declared in src/loader.ts (code constants, not the dataset header)`
        : `POPULATION MISMATCH vs the capture plan in src/loader.ts: ${popIssues.join('; ')}`,
      data: { phaseRounds: counts, totalRounds: rounds.length, populationIssues: popIssues },
    });
  }

  return results;
}

// ── Step 9 helpers (module scope; declared below run() so the line numbers above stay put) ──

/** request.coin → colour of the tier it backs (src/rng.ts PAYOUT_TABLE colours). */
const COIN_TO_COLOR: Record<string, string> = {
  two: 'dark_blue', four: 'grey', eight: 'blue', sixteen: 'purple', twenty_four: 'red', forty_eight: 'green',
};

/** Exact decimal with at most 18 dp → integer units of 1e-18; null if not a plain decimal. */
const units18 = (s: string): bigint | null => {
  const m = /^(-?)(\d+)(?:\.(\d{1,18}))?$/.exec(String(s));
  if (!m) return null;
  const v = BigInt(m[2] + (m[3] ?? '').padEnd(18, '0'));
  return m[1] ? -v : v;
};
