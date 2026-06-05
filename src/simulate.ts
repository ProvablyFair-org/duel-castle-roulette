/**
 * Castle Roulette — Two-pass Monte Carlo simulation.
 *
 * Pass 1: Multi-stream Fisher's method (10 streams × 500K = 5M total).
 *   Castle Roulette is a single-config game (one wheel, 48 positions), so we use
 *   multi-stream with Fisher's combined p-value instead of per-config Bonferroni.
 *   Methodology: multi-config → Bonferroni; single-config → Fisher's.
 *   Each stream uses an independent deterministic seed. Per-stream chi-squared on
 *   48 positions, combined via Fisher's: T = -2 Σ ln(p_i) ~ χ²(2K).
 *   Serial independence tested on full 5M combined stream.
 *
 * Pass 2: Casino seeds from dataset × random drand values — cherry-pick detection.
 *
 * Run: npm run simulate
 * Output: outputs/simulation-results.json + outputs/rtp-convergence.html
 */

import * as crypto from 'crypto';
import * as fs     from 'fs';
import * as path   from 'path';
import { computePositionFromBuffer, RANGE, PAYOUT_TABLE } from './rng';
import { chiSquaredTest, chiSquaredPValue, lag1Autocorrelation, runsTest, normalCDF } from './stats';
import { loadDataset } from './loader';

const PASS1_STREAMS    = 10;
const PASS1_ROUNDS_EACH = 500_000;
const PASS1_ROUNDS_TOTAL = PASS1_STREAMS * PASS1_ROUNDS_EACH; // 5,000,000
const PASS2_NONCES     = 1_000;

const outputsDir = path.join(__dirname, '../outputs');
if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });

// ── Progress bar ──────────────────────────────────────────────────────────

function progressBar(current: number, total: number, label: string, startMs: number): void {
  const pct = current / total;
  const elapsed = (Date.now() - startMs) / 1000;
  const eta = current > 0 ? (elapsed / current) * (total - current) : 0;
  const filled = Math.round(pct * 30);
  const bar = '━'.repeat(filled) + '╌'.repeat(30 - filled);
  process.stdout.write(`\r  ${bar} ${(pct * 100).toFixed(0)}% | ${current.toLocaleString()}/${total.toLocaleString()} | ${label} | ${elapsed.toFixed(1)}s elapsed ~ ${eta.toFixed(0)}s left`);
}

// ── Deterministic seed generation ────────────────────────────────────────

const MASTER_SEED = 'castle-roulette-audit-simulation-2026-04-23';

function deterministicSeed(index: number, prefix: string): string {
  return crypto.createHmac('sha256', MASTER_SEED).update(`${prefix}:${index}`).digest('hex');
}

// ── Pass 1: Multi-stream Fisher's method ─────────────────────────────────

console.log('\n════════════════════════════════════════════════════════════');
console.log('  PASS 1 — Multi-stream Fisher\'s method');
console.log(`  ${PASS1_STREAMS} streams × ${PASS1_ROUNDS_EACH.toLocaleString()} rounds = ${PASS1_ROUNDS_TOTAL.toLocaleString()} total`);
console.log('  Chi-squared per stream, combined via Fisher\'s method');
console.log('════════════════════════════════════════════════════════════\n');

interface StreamResult {
  stream: number;
  chi2: number;
  df: number;
  pValue: number;
  rtp: number;
}

const streamResults: StreamResult[] = [];
const allPositions: number[] = [];
let cumulativeWagered = 0;
let cumulativeReturned = 0;
let globalRound = 0;

const convergencePoints = [1000, 5000, 10000, 50000, 100000, 500000, 1000000, 2000000, 5000000];
const convergenceData: Array<{ rounds: number; rtp: number }> = [];

// Per-color RTP tracking (each color = bet $1 on that color every round)
const COLOR_TIERS = [
  { name: 'Green (48x)',     positions: [0],                              multiplier: 48, color: '#2dff82' },
  { name: 'Red (24x)',       positions: [1, 2],                           multiplier: 24, color: '#ff4444' },
  { name: 'Purple (16x)',    positions: [3, 4, 5],                        multiplier: 16, color: '#b44aff' },
  { name: 'Blue (8x)',       positions: [6, 7, 8, 9, 10, 11],            multiplier: 8,  color: '#4a90ff' },
  { name: 'Grey (4x)',       positions: Array.from({length:12}, (_,i)=>i+12), multiplier: 4, color: '#8899aa' },
  { name: 'Dark Blue (2x)',  positions: Array.from({length:24}, (_,i)=>i+24), multiplier: 2, color: '#1a3a6a' },
];
const colorReturned = new Array(COLOR_TIERS.length).fill(0);
const colorConvergence: Array<{ rounds: number; rtps: number[] }> = [];

const startP1 = Date.now();

for (let s = 0; s < PASS1_STREAMS; s++) {
  const observed = new Array(RANGE).fill(0);
  let streamWagered = 0;
  let streamReturned = 0;

  for (let i = 0; i < PASS1_ROUNDS_EACH; i++) {
    // Each stream uses its own seed prefix for independence
    const serverSeed = deterministicSeed(i, `server-stream-${s}`);
    const drandSeed = deterministicSeed(i, `drand-stream-${s}`) + deterministicSeed(i, `drand2-stream-${s}`).slice(0, 32);
    const keyBuffer = Buffer.from(serverSeed, 'hex');
    const pos = computePositionFromBuffer(keyBuffer, drandSeed);

    observed[pos]++;
    allPositions.push(pos);

    // Track RTP: bet $1 on "two" (2×, positions 24-47)
    cumulativeWagered += 1;
    streamWagered += 1;
    if (pos >= 24) {
      cumulativeReturned += 2;
      streamReturned += 2;
    }

    // Track per-color RTP: for each color, if this position is in that color's set, add multiplier
    for (let ci = 0; ci < COLOR_TIERS.length; ci++) {
      if (COLOR_TIERS[ci].positions.includes(pos)) {
        colorReturned[ci] += COLOR_TIERS[ci].multiplier;
      }
    }

    globalRound++;
    if (convergencePoints.includes(globalRound)) {
      convergenceData.push({ rounds: globalRound, rtp: cumulativeReturned / cumulativeWagered });
      colorConvergence.push({
        rounds: globalRound,
        rtps: colorReturned.map(r => r / globalRound),
      });
    }

    if (globalRound % 50000 === 0) progressBar(globalRound, PASS1_ROUNDS_TOTAL, 'Pass 1', startP1);
  }

  // Per-stream chi-squared on 48 uniform positions
  const expected = new Array(RANGE).fill(PASS1_ROUNDS_EACH / RANGE);
  const chi = chiSquaredTest(observed, expected);

  streamResults.push({
    stream: s,
    chi2: chi.chi2,
    df: chi.df,
    pValue: chi.pValue,
    rtp: streamReturned / streamWagered,
  });
}
progressBar(PASS1_ROUNDS_TOTAL, PASS1_ROUNDS_TOTAL, 'done', startP1);
console.log('\n');

// Fisher's combined test: T = -2 Σ ln(p_i) ~ χ²(2K)
const fisherStat = -2 * streamResults.reduce((sum, r) => sum + Math.log(r.pValue), 0);
const fisherDf = 2 * PASS1_STREAMS;
const fisherP = chiSquaredPValue(fisherStat, fisherDf);

// Serial independence on full 5M combined stream
const lag1R = lag1Autocorrelation(allPositions);
const lag1Z = lag1R * Math.sqrt(PASS1_ROUNDS_TOTAL);
const lag1P = 2 * normalCDF(-Math.abs(lag1Z));
const aboveMedian = allPositions.map(p => p >= RANGE / 2);
const runs = runsTest(aboveMedian);

// Serial independence: |lag1Z| < 3 AND runsP >= 0.01 (matches Crash methodology)
const serialPass = Math.abs(lag1Z) < 3 && runs.pValue >= 0.01;
const serialIndependenceFails = serialPass ? 0 : 1;

const simRTP = cumulativeReturned / cumulativeWagered;

// Per-stream report
console.log('  Per-stream chi-squared:');
for (const r of streamResults) {
  const mark = r.pValue < 0.01 ? ' ← below α' : '';
  console.log(`    Stream ${r.stream}: χ²(${r.df})=${r.chi2.toFixed(2)}, p=${r.pValue.toFixed(4)}, RTP=${(r.rtp * 100).toFixed(2)}%${mark}`);
}
const belowAlpha = streamResults.filter(r => r.pValue < 0.01).length;
console.log(`  Streams below α=0.01: ${belowAlpha}/${PASS1_STREAMS}`);
console.log(`\n  Fisher's combined: T=${fisherStat.toFixed(2)}, df=${fisherDf}, p=${fisherP.toFixed(6)}`);
console.log(`  Lag-1 autocorrelation: r=${lag1R.toFixed(6)}, z=${lag1Z.toFixed(3)}, p=${lag1P.toFixed(4)}`);
console.log(`  Runs test: z=${runs.z.toFixed(3)}, p=${runs.pValue.toFixed(4)}`);
console.log(`  Serial independence failures: ${serialIndependenceFails}`);
console.log(`  Simulated RTP (2× bet): ${(simRTP * 100).toFixed(4)}%`);
console.log(`  Time: ${((Date.now() - startP1) / 1000).toFixed(1)}s\n`);

// ── Pass 2: Casino seeds ──────────────────────────────────────────────────

console.log('════════════════════════════════════════════════════════════');
console.log('  PASS 2 — Casino seeds from dataset');
console.log(`  ${loadDataset().rounds.length} seeds × ${PASS2_NONCES} random drand values`);
console.log('════════════════════════════════════════════════════════════\n');

const ds = loadDataset();
const casinoSeeds = [...new Set(ds.rounds.map(r => r.result.serverSeed))];
const startP2 = Date.now();

let chi2Fails = 0;
let totalCasinoReturned = 0;
let totalCasinoWagered = 0;

for (let s = 0; s < casinoSeeds.length; s++) {
  const seed = casinoSeeds[s];
  const keyBuf = Buffer.from(seed, 'hex');
  const obs = new Array(RANGE).fill(0);

  for (let n = 0; n < PASS2_NONCES; n++) {
    const drand = deterministicSeed(s * PASS2_NONCES + n, 'p2drand') + deterministicSeed(s * PASS2_NONCES + n, 'p2drand2').slice(0, 32);
    const pos = computePositionFromBuffer(keyBuf, drand);
    obs[pos]++;

    totalCasinoWagered += 1;
    if (pos >= 24) totalCasinoReturned += 2;
  }

  const exp = new Array(RANGE).fill(PASS2_NONCES / RANGE);
  const r = chiSquaredTest(obs, exp);
  if (r.pValue < 0.01) chi2Fails++;

  if ((s + 1) % 50 === 0 || s === casinoSeeds.length - 1) {
    progressBar(s + 1, casinoSeeds.length, `seed ${s + 1}/${casinoSeeds.length}`, startP2);
  }
}
progressBar(casinoSeeds.length, casinoSeeds.length, 'done', startP2);
console.log('');

const meanCasinoRTP = totalCasinoReturned / totalCasinoWagered;
const expectedFails = casinoSeeds.length * 0.01;
const threshold = Math.ceil(expectedFails + 3 * Math.sqrt(expectedFails * 0.99));

console.log(`  Seeds tested: ${casinoSeeds.length}`);
console.log(`  Chi-squared failures: ${chi2Fails} (expected ≤${threshold} under H₀)`);
console.log(`  Mean casino RTP: ${(meanCasinoRTP * 100).toFixed(4)}%`);
console.log(`  Time: ${((Date.now() - startP2) / 1000).toFixed(1)}s\n`);

// ── Write results ─────────────────────────────────────────────────────────

const simResults = {
  generatedAt: new Date().toISOString(),
  pass1_fresh_seeds: {
    totalRounds: PASS1_ROUNDS_TOTAL,
    streams: PASS1_STREAMS,
    roundsPerStream: PASS1_ROUNDS_EACH,
    streamResults,
    fisherCombined: { statistic: fisherStat, df: fisherDf, pValue: fisherP },
    serialIndependenceFails,
    lag1R,
    lag1Z,
    lag1P,
    runsZ: runs.z,
    runsP: runs.pValue,
    simulatedRTP: simRTP,
    convergence: convergenceData,
  },
  pass2_casino_seeds: {
    seedsTested: casinoSeeds.length,
    noncesPerSeed: PASS2_NONCES,
    chi2Fails,
    meanRTP: meanCasinoRTP,
  },
};

fs.writeFileSync(path.join(outputsDir, 'simulation-results.json'), JSON.stringify(simResults, null, 2));
console.log('════════════════════════════════════════════════════════════');
console.log('  Written: outputs/simulation-results.json');

// ── RTP Convergence Chart ─────────────────────────────────────────────────

const chartLabels = convergenceData.map(d => d.rounds >= 1e6 ? (d.rounds / 1e6) + 'M' : d.rounds >= 1e3 ? (d.rounds / 1e3) + 'K' : String(d.rounds));

const chartHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>DUEL CASTLE ROULETTE — ${(PASS1_ROUNDS_TOTAL / 1_000_000).toFixed(0)}M SIMULATED ROUNDS</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fafafa; color: #333; padding: 24px; }
  .container { max-width: 1100px; margin: 0 auto; background: #fff; border-radius: 12px; border: 1px solid #e0e0e0; padding: 32px; }
  .chart-wrap { position: relative; height: 420px; margin-bottom: 24px; }
  h1 { text-align: center; font-size: 16px; font-weight: 600; color: #333; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px; }
  h2 { text-align: center; font-size: 14px; color: #666; margin-top: 40px; margin-bottom: 8px; }
  .note { text-align: center; font-size: 11px; color: #999; margin: 4px 0 12px; }
  .box { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin: 16px auto; max-width: 900px; text-align: center; }
</style>
</head><body>
<div class="container">

<h1>DUEL CASTLE ROULETTE — OVERALL RTP CONVERGENCE</h1>
<p class="note">${PASS1_STREAMS} streams x ${(PASS1_ROUNDS_EACH / 1000).toFixed(0)}K = ${(PASS1_ROUNDS_TOTAL / 1_000_000).toFixed(0)}M rounds | Fisher's method | 2x Dark Blue bet</p>
<div class="chart-wrap"><canvas id="overall"></canvas></div>

<div class="box">
  Final RTP: <strong>${(simRTP * 100).toFixed(4)}%</strong> | Theoretical: 100.0000% (zero edge)<br>
  Fisher's combined p: <strong>${fisherP.toFixed(6)}</strong> (T=${fisherStat.toFixed(2)}, df=${fisherDf}) | Serial failures: ${serialIndependenceFails}
</div>

<h2>PER-COLOR RTP CONVERGENCE — ALL 6 TIERS</h2>
<p class="note">Each line = RTP if player bet $1 on that color every round | All converge to 100% (zero edge by construction)</p>
<div class="chart-wrap"><canvas id="percolor"></canvas></div>

<script>
const labels = ${JSON.stringify(chartLabels)};
const overallData = ${JSON.stringify(convergenceData.map(d => d.rtp * 100))};
const colorConv = ${JSON.stringify(colorConvergence.map(c => c.rtps.map(r => r * 100)))};
const colorNames = ${JSON.stringify(COLOR_TIERS.map(t => t.name))};
const colorColors = ${JSON.stringify(COLOR_TIERS.map(t => t.color))};

// Chart 1: Overall
new Chart(document.getElementById('overall'),{type:'line',data:{labels,
datasets:[{label:'Cumulative RTP',data:overallData,borderColor:'#1565c0',tension:0.3,pointRadius:4},
{label:'Theoretical (100%)',data:labels.map(()=>100),borderColor:'#e57373',borderDash:[5,5],pointRadius:0}]},
options:{responsive:true,maintainAspectRatio:false,scales:{y:{min:95,max:105,ticks:{color:'#666',callback:v=>v+'%'},grid:{color:'#e0e0e0'}},x:{ticks:{color:'#666'},grid:{color:'#e0e0e0'}}},
plugins:{legend:{labels:{color:'#333'}}}}});

// Chart 2: Per-color
const colorDatasets = colorNames.map((name, i) => ({
  label: name,
  data: colorConv.map(c => c[i]),
  borderColor: colorColors[i],
  tension: 0.3,
  pointRadius: 3,
  borderWidth: 2,
}));
colorDatasets.push({label:'Theoretical (100%)',data:labels.map(()=>100),borderColor:'#e57373',borderDash:[5,5],pointRadius:0,borderWidth:1});

new Chart(document.getElementById('percolor'),{type:'line',data:{labels,datasets:colorDatasets},
options:{responsive:true,maintainAspectRatio:false,scales:{y:{min:80,max:120,ticks:{color:'#666',callback:v=>v+'%'},grid:{color:'#e0e0e0'}},x:{ticks:{color:'#666'},grid:{color:'#e0e0e0'}}},
plugins:{legend:{labels:{color:'#333',font:{size:11}}}}}});
</script>
</div>
</body></html>`;

fs.writeFileSync(path.join(outputsDir, 'rtp-convergence.html'), chartHtml);
console.log('  Written: outputs/rtp-convergence.html');
console.log('════════════════════════════════════════════════════════════\n');

// normalCDF imported from ./stats — single canonical implementation. The local
// copy that used to live here had the erf path operating on z instead of z/√2,
// producing lag1P off by ~23× (fix landed June 2026 — see audit note).
