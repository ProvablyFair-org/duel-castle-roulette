/**
 * Castle Roulette audit verification suite — 19 scored steps + informational items.
 * Run: npm run verify
 * Expected: 19/19 PASS, verdict PROVABLY FAIR — Full Pass
 * Note: Step 16 reads the committed outputs/drand-api-verification.json (pinned in
 *       src/artifact-pins.ts, checked by Step 18); regenerating it is `npm run timing`.
 */

import * as fs   from 'fs';
import * as path from 'path';

import { loadDataset, checkDatasetHash } from '../src/loader';
import type { StepResult, InfoItem }     from './steps/context';

import * as commitment  from './steps/commitment';
import * as determinism from './steps/determinism';
import * as payouts     from './steps/payouts';
import * as dataset     from './steps/dataset';
import * as simulation  from './steps/simulation';
import * as coverage    from './steps/coverage';
import * as artifacts   from './steps/artifacts';
import * as liveFit     from './steps/live-fit';
import * as statistical from './steps/statistical';
import { labelFor, profileCoverageBlock } from '../src/profile-map';
import { runRtpClaimGate, RTP_CLAIM_STEP } from '../src/rtp-settings';
import { rtpClaimVerdict, RTP_FIGURE_OVERSTATED, RTP_FIGURE_OVERSTATED_EXIT } from '../src/rtp-claim';
import { fieldDiff, beyondTolerance, maxima, DIFF_ATOL, DIFF_RTOL } from '../src/diff';

// ── Pre-flight: dataset hash ───────────────────────────────────────────────

const hashCheck = checkDatasetHash();
console.log('\n  Dataset hash check:');
console.log(`    Expected: ${hashCheck.expected || '(not pinned yet)'}`);
console.log(`    Actual:   ${hashCheck.actual}`);
console.log(`    Status:   ${hashCheck.match ? 'MATCH ✓' : 'MISMATCH ✗ — scored as Step 11 FAIL'}\n`);
// NO EARLY EXIT. The pre-flight used to `process.exit(1)` here, which made Step 11's FAIL branch
// unreachable: a tampered dataset never produced a verdict, a results file or a named failing
// step — only an exit code. The mismatch is now scored by Step 11 (FAIL → NOT PROVABLY FAIR,
// exit 1) and every other step still runs, so the report names what else the altered file breaks.

// ── Setup ─────────────────────────────────────────────────────────────────

const ds = loadDataset();
const rounds = ds.rounds;
const phaseA = rounds.filter(r => r.phase === 'A');
const phaseB = rounds.filter(r => r.phase === 'B');
const phaseC = rounds.filter(r => r.phase === 'C');
const outputsDir = path.join(__dirname, '../outputs');

console.log('══════════════════════════════════════════════════════════');
console.log('  CASTLE ROULETTE AUDIT — VERIFICATION SUITE');
console.log('══════════════════════════════════════════════════════════');
console.log(`  Dataset: ${rounds.length} rounds`);
console.log(`  Phase A: ${phaseA.length}  Phase B: ${phaseB.length}  Phase C: ${phaseC.length}\n`);

// ── Build context ─────────────────────────────────────────────────────────

const ctx = { rounds, phaseA, phaseB, phaseC, outputsDir };

// ── Run scored steps ─────────────────────────────────────────────────────

const results: StepResult[] = [
  ...commitment.run(ctx),    // Steps  1– 4
  ...determinism.run(ctx),   // Steps  5– 6
  ...payouts.run(ctx),       // Steps  7–10
  ...dataset.run(ctx),       // Steps 11–13
  ...simulation.run(ctx),    // Steps 14–16
  ...coverage.run(ctx),      // Step  17
  ...artifacts.run(ctx),     // Step  18
  ...liveFit.run(ctx),       // Step  19 (live-sample fit, informational: INFO on a deviation)
];

// ── RTP-CLAIM rule (1.2.0, Methodology v1.1; 1.0.0 agreed on Slack 2026-09-29) ──
// The per-setting exact RTP table held to the published claim (src/rtp-settings.ts). The package
// switch RTP_CLAIM_RULE_ENFORCED is true (D3, 2026-10-14). Status OVERSTATED (a house-side miss) is
// scored on the step carrying CASTLE-19 as an operator-origin FLAG (the profile's policy) and the
// verdict becomes RTP FIGURE OVERSTATED, exit 5 (rtpClaimVerdict) — never NOT PROVABLY FAIR: the
// draws themselves pass. This package's claim is kind 'noted' (the Zero Edge line), so its status is
// INFO. Status FAIL means the committed table no longer equals this run (or its pin): a
// reproduction failure, exit 1, whether or not the rule is enforced; no step moves for it.
// Scored here, before the step lines are displayed, so a re-scored step prints on its own line
// instead of leaving it reading [PASS] under the verdict; its lines are printed further down.
const rtpClaim = runRtpClaimGate();
const rtpOverstated = rtpClaim.status === 'OVERSTATED';
if (rtpOverstated) {
  const s = (results as any[]).find(r => r.step === RTP_CLAIM_STEP);
  if (s && s.status !== 'FAIL') {
    s.status = 'FLAG'; delete s.origin;   // operator-origin
    s.detail += ` — ${RTP_FIGURE_OVERSTATED} (RTP-CLAIM enforced): ${rtpClaim.result.minimalFix}`;
  }
}

// ── Display scored steps ─────────────────────────────────────────────────

for (const r of results) {
  const tag = r.status === 'PASS' ? '[PASS]' : r.status === 'INFO' ? '[INFO]' : r.status === 'FLAG' ? '[FLAG]' : '[FAIL]';
  console.log(`  ${tag} Step ${r.step} — ${r.name}`);
  if (r.status !== 'PASS') console.log(`         ${r.detail}`);
}

// ── Run informational items ──────────────────────────────────────────────

const infoItems: InfoItem[] = statistical.run(ctx);

if (infoItems.length > 0) {
  console.log('');
  console.log('  ┌── Informational Context (not scored) ──');
  for (const item of infoItems) console.log(`  │ ${item.label}: ${item.detail}`);
  console.log('  └──');
}

// ── RTP-CLAIM rule: its lines (scored above, before the step display) ────────────
console.log('');
for (const line of rtpClaim.lines) console.log(`  ${line}`);

// ── Summary ───────────────────────────────────────────────────────────────

const passed   = results.filter(r => r.status === 'PASS').length;
const flags    = results.filter(r => r.status === 'FLAG').length;
const hardFail = results.filter(r => r.status === 'FAIL').length;
// INFO (profile policy INFORMATIONAL — the live-sample fit, Mike 2026-09-29): reported, never counted
// as a flag, never enters the verdict or the exit code.
const informational = results.filter(r => r.status === 'INFO').length;
// One summary shape across the Duel packages (Mike 2026-09-28, F20): flags split by origin. No step in
// this package marks a FLAG capture-origin, so every FLAG is operator-origin and verdict-affecting —
// exactly how the verdict below already reads `flags`. The split is computed, not typed.
const captureFlags  = results.filter(r => r.status === 'FLAG' && (r as { origin?: string }).origin === 'capture').length;
const operatorFlags = flags - captureFlags;
// Ranked by the rule's rtpClaimVerdict: a failed draw check (NOT PROVABLY FAIR) > RTP FIGURE
// OVERSTATED > Conditional Pass > Full Pass. This suite has no INCOMPLETE state; every FLAG here is
// operator-origin (see above), so `flags` is the Conditional-Pass count, as before.
const ruled    = rtpClaimVerdict({ fails: hardFail, complete: true, overstated: rtpOverstated, opFlags: flags });
const verdict  = ruled.verdict;

console.log('\n══════════════════════════════════════════════════════════');
console.log('  RESULTS SUMMARY');
console.log('══════════════════════════════════════════════════════════');
console.log(`  Passed:     ${passed}/${results.length}`);
console.log(`  Hard fails: ${hardFail}`);
console.log(`  Flags:      ${flags}`);
if (informational > 0) console.log(`  Informational deviations: ${informational} (reported, not counted, verdict unchanged)`);
console.log(`\n  VERDICT: ${verdict}`);
console.log('══════════════════════════════════════════════════════════\n');

// ── Write output ──────────────────────────────────────────────────────────

// ARTIFACTS OF RECORD CARRY NO RUN METADATA (profile CASTLE-27). This object carried `generatedAt`
// and the reproduction gate excluded that field by name; since 2026-09-26 it is ABSENT, so no field is
// excluded. Each step also carries the ProvablyFair.org Castle Roulette profile check(s) it implements
// (src/profile-map.ts) — a label on the emitted record only; it cannot change what a step asserts.
const verificationOutput = {
  totalRounds: rounds.length,
  steps:       results.map(r => ({ ...r, ...labelFor(r.step) })),
  profileCoverage: profileCoverageBlock(),
  info:        infoItems,
  summary:     { passed, flags, operatorFlags, captureFlags, hardFail, verdict },
};

// A VERIFICATION RUN MUST NOT REWRITE THE ARTIFACT IT SCORES. A run that disagrees with the
// committed evidence would otherwise destroy the evidence of the disagreement, and the next run
// would compare the repo against what the failing run had just written. This run writes under
// outputs/run/ — gitignored, a run record rather than audit evidence. The committed copy in
// outputs/ is refreshed only by PF_EMIT=1.
const PF_EMIT = process.env.PF_EMIT === '1';
const RUN_DIR = path.join(outputsDir, 'run');
const RESULTS_DIR = PF_EMIT ? outputsDir : RUN_DIR;
fs.mkdirSync(outputsDir, { recursive: true });
fs.mkdirSync(RUN_DIR, { recursive: true });

fs.writeFileSync(path.join(RESULTS_DIR, 'verification-results.json'), JSON.stringify(verificationOutput, null, 2));

const WROTE_TO = PF_EMIT ? 'outputs' : 'outputs/run';
console.log(`  Outputs written to: ${WROTE_TO}/verification-results.json`);
if (!PF_EMIT) console.log('  Committed artifact NOT modified.');

// ── Reproduction gate ─────────────────────────────────────────────────────────
// THE GATE IS "BEYOND TOLERANCE", NOT "ANY FIELD". Byte identity is the right bar for exact
// content — the dataset, hash-guarded above. It is the wrong bar for a DERIVED statistic:
// recomputed on other hardware a floating-point figure can move by a unit in the last place.
// Scoring that as a disagreement trains a reader to ignore the diff, which is the one outcome
// that makes it useless. The bound is declared in src/diff.ts, far below the precision of any
// figure this audit publishes; outside it is a DIFFERENT result, and the run exits 1.
let reproductionFailures = 0;
if (!PF_EMIT) {
  const readJsonOrNull = (p: string): unknown => {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
  };
  const targets: { file: string; fresh: unknown }[] = [
    { file: 'verification-results.json', fresh: verificationOutput },
  ];
  // test:full regenerates the simulation into outputs/run/ (`npm run simulate` without PF_EMIT); when
  // that regeneration is present it is field-diffed against the pinned committed artifact (added
  // 2026-09-26, profile CASTLE-28). Plain `npm test` does not regenerate it.
  const runSim = readJsonOrNull(path.join(RUN_DIR, 'simulation-results.json'));
  if (runSim !== null) targets.push({ file: 'simulation-results.json', fresh: runSim });
  const perFile = targets.map(t => {
    const committed = readJsonOrNull(path.join(outputsDir, t.file));
    // No field is excluded: run metadata is ABSENT from every artifact, not skipped by the diff.
    const diffs = fieldDiff(committed, t.fresh, []);
    return { file: t.file, readable: committed !== null, diffs, real: beyondTolerance(diffs) };
  });
  const allDiffs  = perFile.flatMap(p => p.diffs);
  const realTotal = perFile.reduce((n, p) => n + p.real.length, 0);
  const gap       = maxima(allDiffs);

  fs.writeFileSync(path.join(RUN_DIR, 'diff.json'), JSON.stringify({
    runtime: process.versions.node,
    verdict,
    tolerance: { atol: DIFF_ATOL, rtol: DIFF_RTOL, rule: '|a-b| <= atol + rtol*max(|a|,|b|); two distinct integers never agree' },
    reproduced: realTotal === 0,
    beyondToleranceCount: realTotal,
    withinToleranceCount: allDiffs.length - realTotal,
    largestGap: gap,
    note: 'Field-level diff between the COMMITTED artifacts and THIS RUN. No field is excluded: the '
      + 'artifacts of record carry no run metadata. Entries marked `withinTolerance` are the '
      + 'same result computed on different hardware and are recorded, not scored. Any entry NOT '
      + 'so marked means this run disagrees with the committed evidence — investigate it; do not '
      + 're-run until it goes away, and do not regenerate the committed artifact to make it go away.',
    files: perFile.map(p => ({ file: `outputs/${p.file}`, committedReadable: p.readable, differences: p.diffs })),
  }, null, 2));

  console.log(`  Reproduction vs the committed artifact on Node ${process.versions.node}: `
    + `${realTotal === 0 ? 'REPRODUCED' : `${realTotal} field(s) BEYOND TOLERANCE`}`
    + `${allDiffs.length - realTotal > 0 ? ` (${allDiffs.length - realTotal} within tolerance` + (gap ? `, largest ${gap.absDiff.toExponential(2)} at ${gap.path}` : '') + ')' : ''}`);
  console.log(`  Diff written to: outputs/run/diff.json`);
  if (realTotal > 0) {
    console.log('  ⚠ THIS RUN DISAGREES WITH THE COMMITTED EVIDENCE:');
    for (const p of perFile) {
      if (!p.readable) { console.log(`      outputs/${p.file}: committed copy absent or unreadable`); continue; }
      for (const d of p.real.slice(0, 4)) {
        console.log(`      ${p.file} ${d.path}: committed ${JSON.stringify(d.committed)} vs this run ${JSON.stringify(d.thisRun)}`);
      }
    }
  }
  reproductionFailures = realTotal;
} else {
  console.log('  REPORT GENERATION (PF_EMIT=1): the committed artifact in outputs/ was rewritten.');
}

// ── Exit contract ─────────────────────────────────────────────────────────────
// FAIL -> 1, RTP FIGURE OVERSTATED -> 5, FLAG -> 2, otherwise 0, so an automated caller reads the verdict from the exit
// status. A reproduction beyond tolerance is a FAIL, not a warning: a gate that only prints is
// not a gate.
if (hardFail > 0 || reproductionFailures > 0 || !rtpClaim.tableMatches) process.exit(1);
if (ruled.exit === RTP_FIGURE_OVERSTATED_EXIT) process.exit(RTP_FIGURE_OVERSTATED_EXIT);
if (flags > 0) process.exit(2);
