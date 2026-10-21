/**
 * Steps 5–6: Determinism verification for Castle Roulette.
 *   5. Position Recomputation — computePosition matches all 1100 rounds
 *   6. Bet-Size Invariance — Phase C ($1) positions recompute identically
 */

import { computePosition, getResult, PAYOUT_TABLE } from '../../src/rng';
import { drawBiasBound } from '../../src/bias';
import { loadSiteVerifier, SITE_VERIFIER_PROVENANCE } from '../../src/site-verifier';
import {
  runOperatorVerifier, operatorPosition, OPERATOR_EXPECTED_LOGS, OPERATOR_VERIFIER_PROVENANCE,
} from '../../src/operator-verifier';

/** The profile's ceiling on per-outcome draw bias (CASTLE-08, rule R1): one part in 2^32. */
const BIAS_CEILING = Math.pow(2, -32);
/** How many disagreements a step names in its detail (a display cap, not a population). */
const MAX_LISTED = 5;
import type { VerifyContext, StepResult } from './context';
import { EXPECTED_ROUNDS, EXPECTED_PHASE_ROUNDS } from '../../src/loader';

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
    // Bound to the declared population: "0 mismatches" over 0 rounds was a PASS.
    const issues: string[] = [];
    if (!(mismatch === 0 && match === EXPECTED_ROUNDS)) {
      issues.push(mismatch > 0 ? `${mismatch} mismatches: ${mismatches.join('; ')}`
        : `POPULATION MISMATCH vs src/loader.ts: ${match} rounds recomputed, ${EXPECTED_ROUNDS} required`);
    }

    // ── Second leg: draw bias bound (CASTLE-08, rule R1 — added 2026-09-26) ────────────────
    // The draw is ONE uint32 reduced by a plain `% 48`, with no rejection, so it is not exactly
    // uniform. HARD FAIL unless the per-position absolute bias, computed from the domain the draw
    // actually reads (src/bias.ts probing src/rng.ts positionFromDigest), is at or under the 2^-32 ceiling. The
    // RTP effect per tier is printed and disclosed (MANIFEST DL-2), never assumed away.
    const bb = drawBiasBound();
    if (bb.predicateProbeFailures > 0) issues.push(`positionFromDigest disagrees with "leading 8 hex digits mod 48" on ${bb.predicateProbeFailures} probe(s)`);
    if (!(bb.perPositionAbsoluteBias <= BIAS_CEILING)) {
      issues.push(`per-position draw bias ${bb.perPositionAbsoluteBias.toExponential(3)} exceeds the 2^-32 ceiling ${BIAS_CEILING.toExponential(3)} (domain 2^${Math.log2(bb.domainSize)})`);
    }

    // ── Third leg: player-verifier parity (CASTLE-24 — added 2026-09-26) ───────────────────
    // The ProvablyFair.org docs-site Castle Roulette verifier (derive.js + its one import) is vendored
    // and pinned in src/site-verifier.ts; its own deriveCastleRouletteSync is EXECUTED on every round
    // and must return the position src/rng.ts computes, and the colour and multiplier the served
    // winningCoin names; its PAYOUT_TABLE must equal src/rng.ts PAYOUT_TABLE entry for entry.
    const coinToMult: Record<string, number> = { two: 2, four: 4, eight: 8, sixteen: 16, twenty_four: 24, forty_eight: 48 };
    const sv = loadSiteVerifier();
    let siteCompared = 0, siteMismatches = 0;
    const siteList: string[] = [];
    if (sv.error) issues.push(sv.error);
    for (const f of sv.files) if (!f.match) issues.push(`${f.file}: vendored ${f.actual ?? '(absent)'} != pinned ${f.pinned}`);
    if (sv.deriveCastle && sv.payoutTable) {
      const tableOk = sv.payoutTable.length === PAYOUT_TABLE.length
        && sv.payoutTable.every((e, i) => e.color === PAYOUT_TABLE[i].color && e.multiplier === PAYOUT_TABLE[i].multiplier);
      if (!tableOk) issues.push('site PAYOUT_TABLE differs from src/rng.ts PAYOUT_TABLE');
      for (const r of rounds) {
        const site = sv.deriveCastle({ serverSeed: r.result.serverSeed, drandRandomness: r.result.drandRandomness });
        const pkg = computePosition(r.result.serverSeed, r.result.drandRandomness);
        siteCompared++;
        const ok = site.position === pkg && site.multiplier === getResult(pkg).multiplier && site.color === getResult(pkg).color
          && site.multiplier === coinToMult[r.result.winningCoin];
        if (!ok) { siteMismatches++; if (siteList.length < MAX_LISTED) siteList.push(`round ${r.roundId}: site pos ${site.position} ${site.color} ${site.multiplier}x vs package pos ${pkg}, served ${r.result.winningCoin}`); }
      }
    }
    if (siteCompared !== EXPECTED_ROUNDS) issues.push(`site verifier compared ${siteCompared} rounds, ${EXPECTED_ROUNDS} required`);
    if (siteMismatches > 0) issues.push(`site verifier disagrees on ${siteMismatches} round(s): ${siteList.join('; ')}`);

    // ── Fourth leg: THE OPERATOR'S OWN Verify-tab code (CASTLE-09 — added 2026-09-26) ──────────
    // A SECOND CHECK, not the source: src/rng.ts is rebuilt from docs/ALGORITHM.md by an implementer who
    // never opened Duel's code (since 20 Oct 2026, v1.2.0). Duel's Castle Roulette code panel, pasted by
    // Paulo from the Verify tab on 2026-09-26, vendored
    // verbatim under evidence/verify-tab/ and pinned in src/operator-verifier.ts. The pinned runner fills
    // in the file's two "User input values" (serverSeed, drandSeed = the captured drandRandomness hex)
    // and runs it. Its validateRouletteResult returns the position as a string; it must be exactly
    // String(n) for n in 0..47, equal the served position AND src/rng.ts's, and the line it prints must
    // equal what it returned. HARD FAIL otherwise, on a pin mismatch, or on a count other than
    // EXPECTED_ROUNDS.
    const opIssues: string[] = [];
    const op = runOperatorVerifier(rounds.map((r, i) => ({ id: String(i), inputs: { serverSeed: r.result.serverSeed, drandSeed: r.result.drandRandomness } })));
    let opChecked = 0, opVsServed = 0, opVsRng = 0, opOffGrid = 0, opPrinted = 0, opErrors = 0;
    const opFirst: string[] = [];
    if (!op.results) {
      opIssues.push(`operator Verify-tab code: ${op.error}`);
    } else {
      const logsOk = op.shippedLogs.length === OPERATOR_EXPECTED_LOGS.length && op.shippedLogs.every((l, i) => l === OPERATOR_EXPECTED_LOGS[i]);
      if (!logsOk) opIssues.push(`operator Verify-tab code printed ${JSON.stringify(op.shippedLogs).slice(0, 200)} as shipped — not only its empty-input message`);
      rounds.forEach((r, i) => {
        const o = op.results!.get(String(i));
        if (o === undefined) return;
        opChecked++;
        if (o.value === null || o.error) { opErrors++; if (opFirst.length < 3) opFirst.push(`round ${r.roundId}: ${o.error ?? 'no value'}`); return; }
        const pos = operatorPosition(o.value);
        if (pos === null) opOffGrid++;
        if (pos !== r.result.position) { opVsServed++; if (opFirst.length < 3) opFirst.push(`round ${r.roundId}: operator "${o.value}" vs served ${r.result.position}`); }
        const mine = computePosition(r.result.serverSeed, r.result.drandRandomness);
        if (pos !== mine) { opVsRng++; if (opFirst.length < 3) opFirst.push(`round ${r.roundId}: operator "${o.value}" vs src/rng.ts ${mine}`); }
        if (o.logs.length === 1 && o.logs[0] === `Roll result: ${o.value}`) opPrinted++;
        else if (opFirst.length < 3) opFirst.push(`round ${r.roundId}: printed ${JSON.stringify(o.logs).slice(0, 100)}`);
      });
      if (opChecked !== EXPECTED_ROUNDS) opIssues.push(`operator Verify-tab code ran on ${opChecked} rounds, ${EXPECTED_ROUNDS} declared`);
      if (opVsServed + opVsRng + opOffGrid + opErrors > 0 || opPrinted !== opChecked) {
        opIssues.unshift(`operator Verify-tab code disagrees: position vs the served one on ${opVsServed}, vs src/rng.ts on ${opVsRng}, `
          + `not a 0..47 integer string on ${opOffGrid}, ${opErrors} run error(s), printed ≠ returned on ${opChecked - opErrors - opPrinted} (${opFirst.join('; ')})`);
      }
    }
    if (opIssues.length > 0) issues.push(`OPERATOR VERIFY-TAB CODE PARITY (CASTLE-09): ${opIssues.join('; ')}`);

    const ok = issues.length === 0;
    results.push({
      step: 5,
      name: 'Position Recomputation',
      status: ok ? 'PASS' : 'FAIL',
      detail: ok
        ? `${match}/${EXPECTED_ROUNDS} positions recomputed from (serverSeed, drandSeed) — 100% parity over the population declared in src/loader.ts. `
          + `Draw bias (CASTLE-08): one uint32 reduced by a plain % ${bb.range} with no rejection — 2^32 = ${bb.range} × ${Math.floor(bb.domainSize / bb.range)} + ${bb.remainder}, `
          + `so positions 0–${bb.remainder - 1} carry one extra value each: per-position bias ${bb.perPositionAbsoluteBias.toExponential(3)} absolute `
          + `(${bb.relativeBias.toExponential(3)} relative), at or under the 2^-32 ceiling ${BIAS_CEILING.toExponential(3)}; largest per-tier EV effect `
          + `${bb.maxEvDeviation.toExponential(3)} (per-tier figures in this step's data block; disclosed, MANIFEST DL-2). Player-verifier parity (CASTLE-24): `
          + `the ProvablyFair.org docs-site derive.js (pinned, ${SITE_VERIFIER_PROVENANCE.ref} @ ${SITE_VERIFIER_PROVENANCE.head.slice(0, 7)}) executed on `
          + `${siteCompared}/${EXPECTED_ROUNDS} rounds — position, colour and multiplier agree with src/rng.ts and the served winning tier on every round; its PAYOUT_TABLE equals src/rng.ts. `
          + `Second check (CASTLE-09; src/rng.ts is rebuilt from docs/ALGORITHM.md, not from this code): Duel's own Castle Roulette Verify-tab code (${OPERATOR_VERIFIER_PROVENANCE.savedAs}, `
          + `${OPERATOR_VERIFIER_PROVENANCE.from}, SHA-256 ${OPERATOR_VERIFIER_PROVENANCE.sha256.slice(0, 16)}…, pinned) executed with only its two `
          + `"User input values" filled in (serverSeed, drandSeed = the captured drandRandomness hex) on ${opChecked}/${EXPECTED_ROUNDS} rounds — `
          + `its value % 48 position equals the served position and src/rng.ts on every round (${opVsServed} / ${opVsRng} differ, ${opOffGrid} not a `
          + `0..47 integer string), printed = returned on ${opPrinted}/${opChecked}`
        : `STEP 5 FAILED: ${issues.join('; ')}`,
      data: {
        recomputed: match, mismatched: mismatch, expected: EXPECTED_ROUNDS,
        drawBias: { ceiling: BIAS_CEILING, ...bb },
        siteVerifier: { provenance: SITE_VERIFIER_PROVENANCE, files: sv.files, compared: siteCompared, mismatches: siteMismatches },
        operatorVerifier: {
          files: op.files.map(f => ({ file: f.file, pinnedSha256: f.pinned, actualSha256: f.actual, match: f.match })),
          provenance: OPERATOR_VERIFIER_PROVENANCE, roundsExecuted: opChecked, differsFromServed: opVsServed, differsFromRng: opVsRng,
          notAPosition: opOffGrid, printedEqualsReturned: opPrinted, errors: opErrors, issues: opIssues,
        },
      },
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
    const expectedC = EXPECTED_PHASE_ROUNDS.C;
    const ok = mismatch === 0 && match === expectedC;
    results.push({
      step: 6,
      name: 'Bet-Size Invariance',
      status: ok ? 'PASS' : 'FAIL',
      detail: ok
        ? `${match}/${expectedC} Phase C ($1) rounds recompute identically — position is independent of bet amount`
        : `${match} of ${phaseC.length} Phase C rounds recompute identically (${mismatch} mismatches); ${expectedC} required by src/loader.ts`,
      data: { recomputed: match, mismatched: mismatch, expected: expectedC },
    });
  }

  return results;
}
