/**
 * Steps 14–15: Simulation results verification for Castle Roulette.
 *  14. Simulation Pass 1 — chi-squared on 48 positions + serial independence
 *  15. Simulation Pass 2 — casino seed distribution test
 *
 * Reads from outputs/simulation-results.json.
 */

import * as fs   from 'fs';
import * as path from 'path';
import type { VerifyContext, StepResult } from './context';

export function run(ctx: VerifyContext): StepResult[] {
  const results: StepResult[] = [];

  const simPath = path.join(ctx.outputsDir, 'simulation-results.json');
  if (!fs.existsSync(simPath)) {
    results.push({ step: 14, name: 'Simulation Pass 1', status: 'FAIL', detail: 'simulation-results.json not found — run npm run simulate' });
    results.push({ step: 15, name: 'Simulation Pass 2', status: 'FAIL', detail: 'simulation-results.json not found' });
    return results;
  }

  const sim = JSON.parse(fs.readFileSync(simPath, 'utf8'));

  // Step 14: Pass 1 — multi-stream Fisher's method (10 streams × 500K rounds)
  {
    const p1 = sim.pass1_fresh_seeds;
    const fisher = p1.fisherCombined;
    const fisherPass = fisher.pValue >= 0.01;
    const serialPass = (p1.serialIndependenceFails || 0) === 0;
    const allPass = fisherPass && serialPass;

    const serialNote = p1.serialIndependenceFails > 0
      ? ` | serialFails=${p1.serialIndependenceFails} (lag1Z=${p1.lag1Z.toFixed(3)} p=${p1.lag1P.toFixed(4)}, runsP=${p1.runsP.toFixed(4)})`
      : ` | serial: 0 failures`;

    results.push({
      step: 14,
      name: 'Simulation Pass 1 (Fisher\'s Combined — 10 Streams)',
      status: allPass ? 'PASS' : 'FAIL',
      detail: `${p1.streams} streams × ${p1.roundsPerStream.toLocaleString()} rounds = ${p1.totalRounds.toLocaleString()} total — Fisher's T=${fisher.statistic.toFixed(2)}, df=${fisher.df}, p=${fisher.pValue.toFixed(4)} | ${p1.streamResults.filter((r: any) => r.pValue < 0.01).length}/${p1.streams} streams below α=0.01${serialNote} | simRTP=${(p1.simulatedRTP * 100).toFixed(4)}%`,
    });
  }

  // Step 15: Pass 2 — casino seeds
  {
    const p2 = sim.pass2_casino_seeds;
    const expectedFails = p2.seedsTested * 0.01;
    const threshold = Math.ceil(expectedFails + 3 * Math.sqrt(expectedFails * 0.99));
    const pass = p2.chi2Fails <= threshold;

    results.push({
      step: 15,
      name: 'Simulation Pass 2 (Casino Seeds)',
      status: pass ? 'PASS' : 'FAIL',
      detail: `${p2.seedsTested} casino seeds × ${p2.noncesPerSeed} random drand values — ${p2.chi2Fails} chi-squared failures (expected ≤${threshold} under H₀) | meanRTP=${(p2.meanRTP * 100).toFixed(4)}%`,
    });
  }

  // Step 16: drand API Signature Verification — reads pinned artifact
  {
    const drandPath = path.join(ctx.outputsDir, 'drand-api-verification.json');
    if (!fs.existsSync(drandPath)) {
      results.push({
        step: 16,
        name: 'drand API Signature Verification',
        status: 'FAIL',
        detail: 'drand-api-verification.json not found — run npm run timing first (requires internet)',
      });
    } else {
      const drand = JSON.parse(fs.readFileSync(drandPath, 'utf8'));
      const total = drand.totalRounds as number;
      const passed = drand.passed as number;
      const failed = drand.failed as number;

      results.push({
        step: 16,
        name: 'drand API Signature Verification',
        status: failed === 0 ? 'PASS' : 'FAIL',
        detail: `${passed}/${total} drand signatures matched byte-for-byte against api.drand.sh (chain: quicknet) — ${failed} failures`,
      });
    }
  }

  return results;
}
