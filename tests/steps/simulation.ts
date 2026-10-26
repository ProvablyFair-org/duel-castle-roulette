/**
 * Steps 14–16: Simulation results and drand API verification for Castle Roulette.
 *  14. Simulation Pass 1 — chi-squared on 48 positions per stream, Fisher's combination,
 *      serial independence. RECOMPUTED from the per-stream counts the artifact ships, and one
 *      stream REPLAYED from src/sim-seeds.ts to bind those counts to the generator.
 *  15. Simulation Pass 2 — casino seed distribution test. REPLAYED in full from the pinned
 *      dataset's seeds and the src/sim-seeds.ts drand schedule; the artifact's scalars are
 *      compared with the replay, not trusted. FAILs below the framework floor of
 *      PASS2_NONCES_FLOOR values per seed (src/sim-seeds.ts).
 *  16. drand API Signature Verification — the 1,350 per-round rows RECOUNTED and bound to the
 *      dataset, not the artifact's own totalRounds/passed/failed summary.
 *
 * Reads outputs/simulation-results.json and outputs/drand-api-verification.json (both pinned in
 * src/artifact-pins.ts and hashed by Step 18).
 */

import * as fs   from 'fs';
import * as path from 'path';
import type { VerifyContext, StepResult } from './context';
import { chiSquaredTest, chiSquaredPValue, normalCDF, lag1Autocorrelation, runsTest } from '../../src/stats';
import { computePositionFromBuffer, RANGE } from '../../src/rng';
import {
  PASS1_STREAMS, PASS1_ROUNDS_EACH, PASS1_ROUNDS_TOTAL, PASS2_NONCES, PASS2_NONCES_FLOOR, PASS1_CONVERGENCE_POINTS,
  pass1Position, pass2Drand,
} from '../../src/sim-seeds';
import { numbersAgree } from '../../src/diff';
import { EXPECTED_ROUNDS, EXPECTED_DISTINCT_SEEDS } from '../../src/loader';

const ALPHA = 0.01;
// Since 2026-09-26 (profile CASTLE-20) ALL ten Pass-1 streams — the full 5,000,000-position sequence —
// are replayed from src/sim-seeds.ts on every verify run (≈30 s on the reference machine), so the
// statistics that need the sequence itself (lag-1 correlation, the runs test, the convergence series)
// are RECOMPUTED, not read. Until then one stream was replayed and those were simulator scalars.

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function run(ctx: VerifyContext): StepResult[] {
  const results: StepResult[] = [];

  const simPath = path.join(ctx.outputsDir, 'simulation-results.json');
  if (!fs.existsSync(simPath)) {
    results.push({ step: 14, name: 'Simulation Pass 1 (Fisher\'s Combined — 10 Streams)', status: 'FAIL', detail: 'simulation-results.json not found — run npm run simulate' });
    results.push({ step: 15, name: 'Simulation Pass 2 (Casino Seeds)', status: 'FAIL', detail: 'simulation-results.json not found' });
  } else {
    const sim = JSON.parse(fs.readFileSync(simPath, 'utf8'));
    results.push(step14(sim));
    results.push(step15(sim, ctx));
  }
  results.push(step16(ctx));
  return results;
}

// ── Step 14 ────────────────────────────────────────────────────────────────

function step14(sim: any): StepResult {
  const p1 = sim?.pass1_fresh_seeds ?? {};
  const issues: string[] = [];

  // Population: the declared run shape is a code constant (src/sim-seeds.ts), not the artifact's
  // description of itself.
  if (p1.streams !== PASS1_STREAMS) issues.push(`streams ${p1.streams} != ${PASS1_STREAMS}`);
  if (p1.roundsPerStream !== PASS1_ROUNDS_EACH) issues.push(`roundsPerStream ${p1.roundsPerStream} != ${PASS1_ROUNDS_EACH}`);
  if (p1.totalRounds !== PASS1_ROUNDS_TOTAL) issues.push(`totalRounds ${p1.totalRounds} != ${PASS1_ROUNDS_TOTAL}`);
  const rows: any[] = Array.isArray(p1.streamResults) ? p1.streamResults : [];
  if (rows.length !== PASS1_STREAMS) issues.push(`streamResults rows ${rows.length} != ${PASS1_STREAMS}`);

  // Recompute every per-stream statistic from the 48 counts the artifact ships.
  const recomputedP: number[] = [];
  let returned = 0;
  let counted = 0;
  let streamsBelowAlpha = 0;
  let maxStatGap = 0;
  const expected = new Array(RANGE).fill(PASS1_ROUNDS_EACH / RANGE);
  rows.forEach((r, idx) => {
    const obs: unknown = r?.observed;
    if (r?.stream !== idx) issues.push(`streamResults[${idx}].stream ${r?.stream} != ${idx}`);
    if (!Array.isArray(obs) || obs.length !== RANGE || !obs.every(v => Number.isInteger(v) && v >= 0)) {
      issues.push(`stream ${idx}: observed is not ${RANGE} non-negative integer counts — nothing to recompute from`);
      return;
    }
    const counts = obs as number[];
    const sum = counts.reduce((a, b) => a + b, 0);
    if (sum !== PASS1_ROUNDS_EACH) issues.push(`stream ${idx}: counts sum to ${sum}, not ${PASS1_ROUNDS_EACH}`);
    counted += sum;
    const chi = chiSquaredTest(counts, expected);
    const streamReturned = 2 * counts.slice(RANGE / 2).reduce((a, b) => a + b, 0);
    returned += streamReturned;
    const rtp = streamReturned / sum;
    recomputedP.push(chi.pValue);
    if (chi.pValue < ALPHA) streamsBelowAlpha++;
    for (const [field, mine] of [['chi2', chi.chi2], ['df', chi.df], ['pValue', chi.pValue], ['rtp', rtp]] as const) {
      const theirs = r?.[field];
      if (!isNum(theirs) || !numbersAgree(theirs, mine)) {
        issues.push(`stream ${idx}: ${field} in the artifact ${theirs} != ${mine} recomputed from its counts`);
      } else {
        maxStatGap = Math.max(maxStatGap, Math.abs(theirs - mine));
      }
    }
  });

  // Fisher's combination from the recomputed p-values.
  const fisherStat = -2 * recomputedP.reduce((s, p) => s + Math.log(p), 0);
  const fisherDf = 2 * PASS1_STREAMS;
  const fisherP = chiSquaredPValue(fisherStat, fisherDf);
  const f = p1.fisherCombined ?? {};
  if (!isNum(f.statistic) || !numbersAgree(f.statistic, fisherStat)) issues.push(`fisherCombined.statistic ${f.statistic} != ${fisherStat} recomputed`);
  if (f.df !== fisherDf) issues.push(`fisherCombined.df ${f.df} != ${fisherDf}`);
  if (!isNum(f.pValue) || !numbersAgree(f.pValue, fisherP)) issues.push(`fisherCombined.pValue ${f.pValue} != ${fisherP} recomputed`);

  const simulatedRTP = counted > 0 ? returned / counted : NaN;
  if (!isNum(p1.simulatedRTP) || !numbersAgree(p1.simulatedRTP, simulatedRTP)) {
    issues.push(`simulatedRTP ${p1.simulatedRTP} != ${simulatedRTP} recomputed from the counts`);
  }

  // FULL REPLAY of the 5,000,000-position sequence, in simulator order (stream 0 … 9, round 0 … N−1),
  // exactly as src/simulate.ts builds it: every stream's counts must equal the artifact's, and the
  // sequence statistics are recomputed with the same src/stats.ts functions and compared with the
  // artifact at the reproduction tolerance.
  const allPositions: number[] = new Array(PASS1_ROUNDS_TOTAL);
  const convergence: Array<{ rounds: number; rtp: number }> = [];
  let k = 0, cumReturned = 0, streamsReplayed = 0, streamsMatching = 0;
  for (let s = 0; s < PASS1_STREAMS; s++) {
    const counts = new Array(RANGE).fill(0);
    for (let i = 0; i < PASS1_ROUNDS_EACH; i++) {
      const pos = pass1Position(s, i);
      counts[pos]++;
      allPositions[k++] = pos;
      if (pos >= RANGE / 2) cumReturned += 2;
      if (PASS1_CONVERGENCE_POINTS.includes(k)) convergence.push({ rounds: k, rtp: cumReturned / k });
    }
    streamsReplayed++;
    const art = rows[s]?.observed;
    const bad = Array.isArray(art) ? counts.findIndex((v, i) => v !== art[i]) : 0;
    if (bad === -1) streamsMatching++;
    else issues.push(`stream ${s} replayed from src/sim-seeds.ts: position ${bad} count ${counts[bad]} != artifact ${Array.isArray(art) ? art[bad] : 'absent'}`);
  }
  const lag1R = lag1Autocorrelation(allPositions);
  const lag1ZRecomputed = lag1R * Math.sqrt(PASS1_ROUNDS_TOTAL);
  const lag1PRecomputed = 2 * normalCDF(-Math.abs(lag1ZRecomputed));
  const runs = runsTest(allPositions.map(p => p >= RANGE / 2));
  for (const [field, mine] of [['lag1R', lag1R], ['lag1Z', lag1ZRecomputed], ['lag1P', lag1PRecomputed], ['runsZ', runs.z], ['runsP', runs.pValue]] as const) {
    const theirs = p1[field];
    if (!isNum(theirs) || !numbersAgree(theirs, mine)) issues.push(`${field} in the artifact ${theirs} != ${mine} recomputed from the replayed sequence`);
  }
  const convArt: any[] = Array.isArray(p1.convergence) ? p1.convergence : [];
  if (convArt.length !== convergence.length) issues.push(`convergence has ${convArt.length} rows, the replay ${convergence.length}`);
  convergence.forEach((c, i) => {
    const a = convArt[i];
    if (a?.rounds !== c.rounds || !isNum(a?.rtp) || !numbersAgree(a.rtp, c.rtp)) {
      issues.push(`convergence[${i}] in the artifact ${JSON.stringify(a)} != replay {rounds: ${c.rounds}, rtp: ${c.rtp}}`);
    }
  });
  const serialFailsRecomputed = Math.abs(lag1ZRecomputed) < 3 && runs.pValue >= 0.01 ? 0 : 1;
  if (p1.serialIndependenceFails !== serialFailsRecomputed) {
    issues.push(`serialIndependenceFails ${p1.serialIndependenceFails} != ${serialFailsRecomputed} recomputed from the replayed sequence`);
  }
  const replayMatches = streamsMatching === PASS1_STREAMS;

  const fisherPass = fisherP >= ALPHA;
  const serialPass = serialFailsRecomputed === 0;
  if (!fisherPass) issues.push(`Fisher's combined p ${fisherP} < α=${ALPHA}`);
  if (!serialPass && serialFailsRecomputed !== null) issues.push('serial independence rule |lag1Z| < 3 AND runsP ≥ 0.01 not met');

  const ok = issues.length === 0;
  return {
    step: 14,
    name: 'Simulation Pass 1 (Fisher\'s Combined — 10 Streams)',
    status: ok ? 'PASS' : 'FAIL',
    detail: ok
      ? `${PASS1_STREAMS} streams × ${PASS1_ROUNDS_EACH.toLocaleString()} rounds = ${PASS1_ROUNDS_TOTAL.toLocaleString()} total (code constants in src/sim-seeds.ts). `
        + `Recomputed here from the ${RANGE} per-position counts each stream ships: every stream's chi-squared, df, p and RTP, Fisher's combination (p at or above α=${ALPHA}), `
        + `and the simulated RTP — all agree with the artifact; ${streamsBelowAlpha}/${PASS1_STREAMS} streams below α. `
        + `All ${PASS1_STREAMS} streams — the full ${PASS1_ROUNDS_TOTAL.toLocaleString()}-position sequence — regenerated from src/sim-seeds.ts: every stream's counts identical to the artifact's. `
        + `Serial independence and convergence RECOMPUTED from the replayed sequence (since 2026-09-26): lag-1 correlation, its z and p, the runs test and all ${PASS1_CONVERGENCE_POINTS.length} convergence points agree with the artifact at the reproduction tolerance, and the rule |lag1Z| < 3 AND runsP ≥ 0.01 is met. Figures in this step's data block.`
      : `${issues.length} issue(s): ${issues.slice(0, 5).join('; ')}`,
    data: {
      streams: p1.streams ?? null,
      roundsPerStream: p1.roundsPerStream ?? null,
      totalRounds: p1.totalRounds ?? null,
      alpha: ALPHA,
      fisherStatistic: fisherStat,
      fisherDf,
      fisherP,
      streamsBelowAlpha,
      serialIndependenceFails: serialFailsRecomputed,
      lag1R,
      lag1Z: lag1ZRecomputed,
      lag1P: lag1PRecomputed,
      runsZ: runs.z,
      runsP: runs.pValue,
      simulatedRTP,
      streamsReplayed,
      streamsMatching,
      allStreamsMatch: replayMatches,
      convergencePointsReplayed: convergence.length,
      maxPerStreamStatGap: maxStatGap,
      issues,
    },
  };
}

// ── Step 15 ────────────────────────────────────────────────────────────────

function step15(sim: any, ctx: VerifyContext): StepResult {
  const p2 = sim?.pass2_casino_seeds ?? {};
  const issues: string[] = [];

  // Full replay: the same seeds (distinct server seeds of the pinned dataset, in dataset order),
  // the same drand schedule, the same test.
  const casinoSeeds = [...new Set(ctx.rounds.map(r => r.result.serverSeed))];
  // The framework floor (C-08), since 2026-10-23: a Pass 2 cut below it fails here even when the
  // artifact was regenerated to match the smaller run, which the replay alone would accept.
  if (PASS2_NONCES < PASS2_NONCES_FLOOR) issues.push(`PASS2_NONCES ${PASS2_NONCES} is below the framework floor of ${PASS2_NONCES_FLOOR} values per revealed seed`);
  if (casinoSeeds.length !== EXPECTED_DISTINCT_SEEDS) issues.push(`distinct casino seeds ${casinoSeeds.length} != ${EXPECTED_DISTINCT_SEEDS} (src/loader.ts)`);
  let chi2Fails = 0;
  let wagered = 0;
  let returned = 0;
  const expected = new Array(RANGE).fill(PASS2_NONCES / RANGE);
  for (let s = 0; s < casinoSeeds.length; s++) {
    const keyBuf = Buffer.from(casinoSeeds[s], 'hex');
    const obs = new Array(RANGE).fill(0);
    for (let n = 0; n < PASS2_NONCES; n++) {
      const pos = computePositionFromBuffer(keyBuf, pass2Drand(s, n));
      obs[pos]++;
      wagered += 1;
      if (pos >= RANGE / 2) returned += 2;
    }
    if (chiSquaredTest(obs, expected).pValue < ALPHA) chi2Fails++;
  }
  const meanRTP = wagered > 0 ? returned / wagered : NaN;

  if (p2.seedsTested !== casinoSeeds.length) issues.push(`artifact seedsTested ${p2.seedsTested} != ${casinoSeeds.length} replayed`);
  if (p2.noncesPerSeed !== PASS2_NONCES) issues.push(`artifact noncesPerSeed ${p2.noncesPerSeed} != ${PASS2_NONCES}`);
  if (p2.chi2Fails !== chi2Fails) issues.push(`artifact chi2Fails ${p2.chi2Fails} != ${chi2Fails} replayed`);
  if (!isNum(p2.meanRTP) || !numbersAgree(p2.meanRTP, meanRTP)) issues.push(`artifact meanRTP ${p2.meanRTP} != ${meanRTP} replayed`);

  const expectedFails = casinoSeeds.length * ALPHA;
  const threshold = Math.ceil(expectedFails + 3 * Math.sqrt(expectedFails * (1 - ALPHA)));
  if (casinoSeeds.length === 0) issues.push('zero casino seeds replayed');
  if (chi2Fails > threshold) issues.push(`${chi2Fails} replayed chi-squared failures exceed the H₀ threshold ${threshold}`);

  const ok = issues.length === 0;
  return {
    step: 15,
    name: 'Simulation Pass 2 (Casino Seeds)',
    status: ok ? 'PASS' : 'FAIL',
    detail: ok
      ? `REPLAYED in full: ${casinoSeeds.length} distinct casino seeds from the pinned dataset × ${PASS2_NONCES} simulated beacon values derived from the pinned master seed in src/sim-seeds.ts (framework floor ${PASS2_NONCES_FLOOR}) — ${chi2Fails} chi-squared failures against a threshold of ${threshold} under H₀; seedsTested, chi2Fails and meanRTP in the artifact agree with the replay. Mean casino RTP in this step's data block.`
      : `${issues.length} issue(s): ${issues.slice(0, 5).join('; ')}`,
    data: {
      seedsTested: casinoSeeds.length,
      noncesPerSeed: PASS2_NONCES,
      noncesFloor: PASS2_NONCES_FLOOR,
      chi2Fails,
      threshold,
      expectedFailsUnderH0: expectedFails,
      meanRTP,
      replayed: true,
      issues,
    },
  };
}

// ── Step 16 ────────────────────────────────────────────────────────────────

function step16(ctx: VerifyContext): StepResult {
  const name = 'drand API Signature Verification';
  const drandPath = path.join(ctx.outputsDir, 'drand-api-verification.json');
  if (!fs.existsSync(drandPath)) {
    return { step: 16, name, status: 'FAIL', detail: 'drand-api-verification.json not found — run npm run timing first (requires internet)' };
  }
  const drand = JSON.parse(fs.readFileSync(drandPath, 'utf8'));
  const rows: any[] = Array.isArray(drand.results) ? drand.results : [];
  const issues: string[] = [];

  // Recount the rows and bind each one to the dataset round it claims to be. The artifact's own
  // totalRounds/passed/failed are its description of itself; they are compared with the recount,
  // never used as the count.
  const byRound = new Map(ctx.rounds.map(r => [r.roundId, r]));
  const seen = new Set<number>();
  let matched = 0;
  let unmatched = 0;
  for (const row of rows) {
    const r = byRound.get(row?.roundId);
    if (!r) { issues.push(`row roundId ${row?.roundId} is not a dataset round`); unmatched++; continue; }
    if (seen.has(row.roundId)) { issues.push(`round ${row.roundId} appears twice`); unmatched++; continue; }
    seen.add(row.roundId);
    const sigOk = typeof row.apiSignature === 'string'
      && row.apiSignature === row.datasetSignature
      && row.datasetSignature === r.result.drandRandomness
      && row.drandRoundId === r.result.drandRoundId
      && row.signatureMatch === true;
    if (sigOk) matched++;
    else { unmatched++; if (issues.length < 8) issues.push(`round ${row.roundId}: API signature / dataset signature / drand round do not all agree`); }
  }
  if (matched !== EXPECTED_ROUNDS) issues.push(`rows matched ${matched} != ${EXPECTED_ROUNDS} (src/loader.ts)`);
  if (drand.totalRounds !== rows.length) issues.push(`summary totalRounds ${drand.totalRounds} != ${rows.length} rows`);
  if (drand.passed !== matched) issues.push(`summary passed ${drand.passed} != ${matched} recounted`);
  if (drand.failed !== rows.length - matched) issues.push(`summary failed ${drand.failed} != ${rows.length - matched} recounted`);

  // "Matched byte-for-byte", not "verified": src/verify-drand-timing.js compares the captured
  // signature string with the one the beacon API returns for that round (string equality at
  // line ~118); it does not BLS-verify the signature against the chain's public key. The host
  // named here is the one the script actually fetched from (DRAND_API_BASE).
  const ok = issues.length === 0;
  return {
    step: 16,
    name,
    status: ok ? 'PASS' : 'FAIL',
    detail: ok
      ? `${matched}/${EXPECTED_ROUNDS} per-round rows recounted and bound to the dataset: each row's API signature equals the dataset's drandRandomness for the same round and drand round id, matched byte-for-byte against drand.cloudflare.com (chain: quicknet); the artifact's summary counters agree with the recount`
      : `${issues.length} issue(s): ${issues.slice(0, 5).join('; ')}`,
    data: { rows: rows.length, matched, unmatched, summary: { total: drand.totalRounds, passed: drand.passed, failed: drand.failed }, issues: issues.slice(0, 20) },
  };
}
