/**
 * Steps 1–4: Commitment verification for Castle Roulette (drand-based).
 *   1. Seed Hash Integrity — SHA256(serverSeed) === serverSeedHash
 *   2. Bet Before drand Beacon — bet placed before drand published for all rounds (times the bet, not the commitment)
 *   3. drand Round Monotonicity — drand rounds strictly increasing (ordering only; not beacon selection)
 *   4. Server Seed Uniqueness — all seeds distinct
 */

import { verifyHash } from '../../src/rng';
import type { VerifyContext, StepResult } from './context';
import {
  EXPECTED_ROUNDS,
  EXPECTED_DISTINCT_SEEDS,
  EXPECTED_DRAND_TRANSITIONS,
  EXPECTED_TIMING_SOURCE,
  EXPECTED_ROUNDS_WITH_SERVER_TIMESTAMP,
} from '../../src/loader';

export function run(ctx: VerifyContext): StepResult[] {
  const results: StepResult[] = [];
  const { rounds } = ctx;

  // Step 1: Seed Hash Integrity
  // "0 failures" is not a result — an empty round list satisfies it, and so does a list cut
  // to one row. The step states how many commitments it OWES against the population in
  // src/loader.ts and fails when it cannot open that many. A round whose seed was never
  // revealed is counted and named rather than passed over: a commitment with nothing to
  // open is exactly the one an operator would want no one to look at.
  {
    let verified = 0;
    let broken = 0;
    let unrevealed = 0;
    const failures: string[] = [];
    for (const r of rounds) {
      if (!r.result.serverSeed || !r.result.serverSeedHash) {
        unrevealed++;
        failures.push(`round ${r.roundId}: commitment not opened (seed or hash absent)`);
        continue;
      }
      if (verifyHash(r.result.serverSeed, r.result.serverSeedHash)) verified++;
      else {
        broken++;
        if (failures.length < 5) failures.push(`round ${r.roundId}: SHA-256(serverSeed) ≠ serverSeedHash`);
      }
    }

    const popIssues: string[] = [];
    if (rounds.length !== EXPECTED_ROUNDS) popIssues.push(`rounds ${rounds.length} != ${EXPECTED_ROUNDS}`);
    if (verified !== EXPECTED_ROUNDS) popIssues.push(`commitments opened ${verified} != ${EXPECTED_ROUNDS}`);

    const ok = broken === 0 && unrevealed === 0 && popIssues.length === 0;
    results.push({
      step: 1,
      name: 'Seed Hash Integrity',
      status: ok ? 'PASS' : 'FAIL',
      detail: ok
        ? `All ${EXPECTED_ROUNDS} commitments required by src/loader.ts opened and verified — SHA-256(serverSeed_bytes) === serverSeedHash; 0 rounds left unopened`
        : popIssues.length > 0
          ? `POPULATION MISMATCH vs src/loader.ts: ${popIssues.join('; ')}`
          : `${broken} hash mismatches and ${unrevealed} unopened commitments out of ${rounds.length} rounds`,
      data: { rounds: rounds.length, verified, broken, unrevealed, populationIssues: popIssues, failures },
    });
  }

  // Step 2: bet before drand beacon (operator timestamp; times the bet, not the commitment)
  //
  // Two things were missing. The margins were rendered into the detail sentence, where the
  // reproduction gate can only compare them as strings — the sentence now states the BOUND
  // and the measurements live in `data`. And nothing checked WHERE the bet timestamp came
  // from: `timing.source` is 'transactions-api' (a server-side timestamp) for every round in
  // this capture, but a 'capture-only' row is the client's own clock and is much weaker
  // evidence that the bet preceded the beacon. Accepting it silently would let the weakest possible
  // evidence carry the strongest claim this step makes.
  {
    let positive = 0;
    let nonPositive = 0;
    let minMarginMs = Infinity;
    let maxMarginMs = -Infinity;
    let sumMs = 0;
    let serverTimestamped = 0;
    let precomputedDisagreements = 0;
    const failures: string[] = [];

    for (const r of rounds) {
      if (r.timing.source === EXPECTED_TIMING_SOURCE) serverTimestamped++;
      else failures.push(`round ${r.roundId}: timing.source '${r.timing.source}' is not '${EXPECTED_TIMING_SOURCE}'`);

      const cbd = r.timing.drandPublishedAt * 1000 - r.timing.betPlacedAt;
      // The capture also stores its own margin. This step does not trust it — the margin
      // above is recomputed from raw fields — but a stored figure that disagrees with the
      // recomputation means the two halves of the record describe different events.
      // EXACT: both are integer milliseconds, and measured on the pinned dataset all 1,350
      // stored margins equal the recomputation exactly. The former 1 ms cap admitted a stored
      // figure that described a different event by a millisecond.
      if (r.timing.commitmentBeforeDrand !== cbd) {
        precomputedDisagreements++;
        if (failures.length < 8) {
          failures.push(`round ${r.roundId}: stored commitmentBeforeDrand ${r.timing.commitmentBeforeDrand} ms != ${cbd} ms recomputed from drandPublishedAt and betPlacedAt`);
        }
      }

      if (cbd > 0) {
        positive++;
        if (cbd < minMarginMs) minMarginMs = cbd;
        if (cbd > maxMarginMs) maxMarginMs = cbd;
        sumMs += cbd;
      } else {
        nonPositive++;
        if (failures.length < 8) failures.push(`round ${r.roundId}: bet placed at or after drand publication`);
      }
    }
    const meanMs = sumMs / Math.max(1, positive);

    const popIssues: string[] = [];
    if (positive !== EXPECTED_ROUNDS) popIssues.push(`rounds with a positive margin ${positive} != ${EXPECTED_ROUNDS}`);
    if (serverTimestamped !== EXPECTED_ROUNDS_WITH_SERVER_TIMESTAMP) {
      popIssues.push(`rounds with a server-side timestamp ${serverTimestamped} != ${EXPECTED_ROUNDS_WITH_SERVER_TIMESTAMP}`);
    }

    const ok = nonPositive === 0 && precomputedDisagreements === 0 && popIssues.length === 0;
    results.push({
      step: 2,
      name: 'Bet Before drand Beacon',
      status: ok ? 'PASS' : 'FAIL',
      detail: ok
        ? `All ${EXPECTED_ROUNDS} rounds required by src/loader.ts: the bet was accepted strictly before the drand beacon was published, every margin anchored to a server-side '${EXPECTED_TIMING_SOURCE}' timestamp and the drand chain formula. Margins in this step's data block.`
        : popIssues.length > 0
          ? `POPULATION MISMATCH vs src/loader.ts: ${popIssues.join('; ')}`
          : `${nonPositive} rounds without a positive margin, ${precomputedDisagreements} stored margins disagreeing with the recomputation: ${failures.slice(0, 3).join('; ')}`,
      data: {
        roundsWithPositiveMargin: positive,
        roundsWithoutPositiveMargin: nonPositive,
        roundsWithServerTimestamp: serverTimestamped,
        precomputedMarginDisagreements: precomputedDisagreements,
        minMarginSeconds: positive > 0 ? minMarginMs / 1000 : null,
        meanMarginSeconds: positive > 0 ? meanMs / 1000 : null,
        maxMarginSeconds: positive > 0 ? maxMarginMs / 1000 : null,
        populationIssues: popIssues,
        failures: failures.slice(0, 10),
      },
    });
  }

  // Step 3: drand Round Monotonicity
  // Castle Roulette rotates nothing: there is no next-seed hash to chain and no epoch to
  // size. Round ORDER is carried by the drand beacon instead, and this is the step that
  // holds it: strictly increasing round IDs show that no beacon round was reused or taken
  // out of order. That is ordering ONLY. It does not show that the server could not choose
  // which later beacon a round uses (review of 6 Oct 2026, reproduced: round 538493's seed with
  // its recorded beacon 28007049 lands on 27; with public beacon 28007054 it lands on 2, and the
  // swap keeps all 1,349 transitions increasing and the bet-to-beacon margin positive at 35.379 s).
  // Advance beacon selection is not verified by this step or by this capture. The comparison
  // count is bound to the population: one round makes no comparisons and used to satisfy the
  // step trivially.
  {
    const violations: string[] = [];
    let compared = 0;
    for (let i = 1; i < rounds.length; i++) {
      compared++;
      if (rounds[i].result.drandRoundId <= rounds[i - 1].result.drandRoundId) {
        violations.push(`round ${rounds[i].roundId}: drand ${rounds[i].result.drandRoundId} does not exceed the previous ${rounds[i - 1].result.drandRoundId}`);
      }
    }
    const popIssues: string[] = [];
    if (compared !== EXPECTED_DRAND_TRANSITIONS) {
      popIssues.push(`transitions examined ${compared} != ${EXPECTED_DRAND_TRANSITIONS}`);
    }
    const ok = violations.length === 0 && popIssues.length === 0;
    results.push({
      step: 3,
      name: 'drand Round Monotonicity',
      status: ok ? 'PASS' : 'FAIL',
      detail: ok
        ? `All ${EXPECTED_DRAND_TRANSITIONS} consecutive transitions required by src/loader.ts checked — drand round IDs strictly increasing: no beacon round reused or out of order. This establishes ordering only; advance beacon selection (the server choosing which later beacon a round uses) was not verified`
        : popIssues.length > 0
          ? `POPULATION MISMATCH vs src/loader.ts: ${popIssues.join('; ')}`
          : `${violations.length} monotonicity violations detected`,
      data: { compared, violations: violations.length, populationIssues: popIssues, failures: violations.slice(0, 10) },
    });
  }

  // Step 4: Server Seed Uniqueness
  // `seeds.size === rounds.length` compares the data with itself: truncate the capture and
  // both sides shrink together, so the step could not see it. The declared count is the
  // other half of the comparison now.
  {
    const seeds = new Set(rounds.map(r => r.result.serverSeed));
    const hashes = new Set(rounds.map(r => r.result.serverSeedHash));
    const issues: string[] = [];
    if (seeds.size !== rounds.length) issues.push(`${rounds.length - seeds.size} rounds reuse a server seed`);
    if (hashes.size !== rounds.length) issues.push(`${rounds.length - hashes.size} rounds reuse a commitment hash`);
    if (seeds.size !== EXPECTED_DISTINCT_SEEDS) issues.push(`distinct seeds ${seeds.size} != ${EXPECTED_DISTINCT_SEEDS}`);
    if (hashes.size !== EXPECTED_DISTINCT_SEEDS) issues.push(`distinct hashes ${hashes.size} != ${EXPECTED_DISTINCT_SEEDS}`);

    results.push({
      step: 4,
      name: 'Server Seed Uniqueness',
      status: issues.length === 0 ? 'PASS' : 'FAIL',
      detail: issues.length === 0
        ? `${EXPECTED_DISTINCT_SEEDS} distinct seeds and ${EXPECTED_DISTINCT_SEEDS} distinct commitment hashes, matching the population declared in src/loader.ts — one fresh commitment per round, no reuse`
        : `SEED UNIQUENESS / POPULATION MISMATCH: ${issues.join('; ')}`,
      data: { distinctSeeds: seeds.size, distinctHashes: hashes.size, rounds: rounds.length, issues },
    });
  }

  return results;
}
