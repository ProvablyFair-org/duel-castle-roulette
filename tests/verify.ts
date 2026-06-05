/**
 * Castle Roulette audit verification suite — 16 scored steps + informational items.
 * Run: npm run verify
 * Expected: 16/16 PASS, verdict PROVABLY FAIR — Full Pass
 * Note: Step 16 requires outputs/drand-api-verification.json — run npm run timing first.
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
import * as statistical from './steps/statistical';

// ── Pre-flight: dataset hash ───────────────────────────────────────────────

const hashCheck = checkDatasetHash();
console.log('\n  Dataset hash check:');
console.log(`    Expected: ${hashCheck.expected || '(not pinned yet)'}`);
console.log(`    Actual:   ${hashCheck.actual}`);
console.log(`    Status:   ${hashCheck.match ? 'MATCH ✓' : 'MISMATCH ✗ — abort'}\n`);
if (!hashCheck.match) { process.exit(1); }

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
  ...simulation.run(ctx),    // Steps 14–15
];

// ── Display scored steps ─────────────────────────────────────────────────

for (const r of results) {
  const tag = r.status === 'PASS' ? '[PASS]' : r.status === 'FLAG' ? '[FLAG]' : '[FAIL]';
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

// ── Summary ───────────────────────────────────────────────────────────────

const passed   = results.filter(r => r.status === 'PASS').length;
const flags    = results.filter(r => r.status === 'FLAG').length;
const hardFail = results.filter(r => r.status === 'FAIL').length;
const verdict  = hardFail > 0
  ? 'NOT PROVABLY FAIR'
  : flags > 0
    ? 'PROVABLY FAIR — Conditional Pass'
    : 'PROVABLY FAIR — Full Pass';

console.log('\n══════════════════════════════════════════════════════════');
console.log('  RESULTS SUMMARY');
console.log('══════════════════════════════════════════════════════════');
console.log(`  Passed:     ${passed}/${results.length}`);
console.log(`  Hard fails: ${hardFail}`);
console.log(`  Flags:      ${flags}`);
console.log(`\n  VERDICT: ${verdict}`);
console.log('══════════════════════════════════════════════════════════\n');

// ── Write output ──────────────────────────────────────────────────────────

if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });

fs.writeFileSync(path.join(outputsDir, 'verification-results.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  totalRounds: rounds.length,
  steps:       results,
  info:        infoItems,
  summary:     { passed, flags, hardFail, verdict },
}, null, 2));

console.log('  Outputs written to: outputs/verification-results.json\n');

if (hardFail > 0) process.exit(1);
