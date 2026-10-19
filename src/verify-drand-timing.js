const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('fs');

/**
 * Check drand timing (bet before beacon) for Castle Roulette.
 *
 * For each round in the dataset, verifies:
 *   1. Chain formula: drandPublishedAt matches quicknet formula
 *   2. Bet before beacon: commitmentBeforeDrand > 0 for all rounds
 *   3. drand API: signature from drand.cloudflare.com (DRAND_API_BASE) matches dataset drandRandomness
 *      byte-for-byte — string comparison with the beacon API's response, not BLS verification
 *
 * Timing endpoints:
 *   betPlacedAt = operator's transactions-API timestamp (the operator's own clock, MANIFEST P5,
 *                 as recorded by the capture, P1)
 *   drandPublishedAt = quicknet chain formula (verifiable by anyone)
 * The margin times the bet, not the moment the server seed hash was shown (MANIFEST DL-3).
 *
 * Run: npm run timing (requires internet for drand API calls)
 * Output: outputs/drand-api-verification.json
 */

const QUICKNET_GENESIS = 1692803367;
const QUICKNET_PERIOD  = 3;
const DRAND_CHAIN_HASH = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971';
const DRAND_API_BASE   = `https://drand.cloudflare.com/${DRAND_CHAIN_HASH}/public`;

function drandPublishTime(round) {
  return QUICKNET_GENESIS + (round - 1) * QUICKNET_PERIOD;
}

async function fetchDrandRound(round, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(`${DRAND_API_BASE}/${round}`);
      if (resp.ok) return resp.json();
      if (resp.status === 502 || resp.status === 503 || resp.status === 429) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
          continue;
        }
      }
      throw new Error(`drand API ${resp.status} for round ${round}`);
    } catch (err) {
      if (attempt < retries && (err.message.includes('502') || err.message.includes('503') || err.message.includes('fetch'))) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      throw err;
    }
  }
}

async function main() {
  const data = JSON.parse(readFileSync('./data/castle-roulette-master-1350rounds.json', 'utf8'));
  const rounds = data.rounds;

  console.log('=== drand Timing Verification (bet before beacon) — Castle Roulette ===\n');
  console.log(`Dataset: ${rounds.length} rounds`);
  console.log(`Chain: quicknet (${DRAND_CHAIN_HASH.substring(0, 16)}...)`);
  console.log(`Genesis: ${QUICKNET_GENESIS} | Period: ${QUICKNET_PERIOD}s\n`);

  // ── Step 1: Verify chain formula matches dataset ──
  console.log('── Step 1: Chain Formula Verification ──\n');
  let formulaPass = 0, formulaFail = 0;
  for (const r of rounds) {
    const expected = drandPublishTime(r.result.drandRoundId);
    if (r.timing.drandPublishedAt === expected) {
      formulaPass++;
    } else {
      formulaFail++;
      console.log(`  FAIL: round ${r.roundId} — dataset ${r.timing.drandPublishedAt} != formula ${expected}`);
    }
  }
  console.log(`Chain formula: ${formulaPass}/${rounds.length} match${formulaFail > 0 ? ', ' + formulaFail + ' FAILED' : ''}\n`);

  // ── Step 2: Verify commitmentBeforeDrand > 0 for all rounds ──
  console.log('── Step 2: Bet-Before-Beacon Margin (bet placed before drand published, operator clock) ──\n');
  let positive = 0, nonPositive = 0, nullField = 0;
  let apiSourced = 0, otherSource = 0;
  for (const r of rounds) {
    const cbd = r.timing.commitmentBeforeDrand;
    if (r.timing.source === 'transactions-api') apiSourced++;
    else otherSource++;
    if (cbd === null || cbd === undefined) {
      nullField++;
    } else if (cbd > 0) {
      positive++;
    } else {
      nonPositive++;
      console.log(`  FAIL: round ${r.roundId} — commitmentBeforeDrand = ${cbd}ms`);
    }
  }
  console.log(`Server-side (transactions-api):   ${apiSourced}/${rounds.length}`);
  console.log(`Other source:                     ${otherSource}`);
  console.log(`Positive (bet before beacon):     ${positive}/${rounds.length}`);
  console.log(`Non-positive:                     ${nonPositive}`);
  console.log(`Null/missing:                     ${nullField}`);

  const vals = rounds.map(r => r.timing.commitmentBeforeDrand).sort((a, b) => a - b);
  const sum = vals.reduce((s, v) => s + v, 0);
  const mean = sum / vals.length;
  console.log(`\nMin gap:    ${vals[0]}ms (${(vals[0] / 1000).toFixed(3)}s)`);
  console.log(`Median gap: ${vals[Math.floor(vals.length / 2)]}ms (${(vals[Math.floor(vals.length / 2)] / 1000).toFixed(3)}s)`);
  console.log(`Mean gap:   ${mean.toFixed(0)}ms (${(mean / 1000).toFixed(3)}s)`);
  console.log(`Max gap:    ${vals[vals.length - 1]}ms (${(vals[vals.length - 1] / 1000).toFixed(3)}s)`);
  console.log(`Gaps <1000ms: ${vals.filter(v => v < 1000).length}\n`);

  // ── Step 3: Full drand API verification (all rounds) ──
  console.log(`── Step 3: drand API Verification (${rounds.length} rounds) ──\n`);

  let apiPass = 0, apiFail = 0;
  const apiResults = [];
  const BATCH_SIZE = 10;
  const BATCH_DELAY = 500;

  for (let batch = 0; batch < rounds.length; batch += BATCH_SIZE) {
    const slice = rounds.slice(batch, batch + BATCH_SIZE);
    const promises = slice.map(async (r) => {
      try {
        const api = await fetchDrandRound(r.result.drandRoundId);
        const sigMatch = api.signature === r.result.drandRandomness;
        if (sigMatch) {
          apiPass++;
        } else {
          apiFail++;
          console.log(`  MISMATCH: round ${r.roundId} → drand ${r.result.drandRoundId}`);
        }
        return {
          roundId: r.roundId,
          drandRoundId: r.result.drandRoundId,
          signatureMatch: sigMatch,
          datasetSignature: r.result.drandRandomness,
          apiSignature: api.signature,
        };
      } catch (err) {
        apiFail++;
        console.log(`  ERROR: round ${r.roundId} → drand ${r.result.drandRoundId}: ${err.message}`);
        return {
          roundId: r.roundId,
          drandRoundId: r.result.drandRoundId,
          signatureMatch: false,
          error: err.message,
        };
      }
    });
    const batchResults = await Promise.all(promises);
    apiResults.push(...batchResults);

    const done = Math.min(batch + BATCH_SIZE, rounds.length);
    const pct = ((done / rounds.length) * 100).toFixed(0);
    process.stdout.write(`\r  Verified: ${done}/${rounds.length} (${pct}%)`);

    if (batch + BATCH_SIZE < rounds.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
  }
  console.log(`\n  Result: ${apiPass}/${rounds.length} signatures match, ${apiFail} failures\n`);

  // Save results
  const outputDir = './outputs';
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  // NO `generatedAt` (removed 2026-09-26, profile CASTLE-27): the file is pinned (src/artifact-pins.ts)
  // and a fetch timestamp inside it is run metadata. The fetch date of the committed copy is recorded in
  // MANIFEST.md; a re-fetch prints its own time to the console.
  console.log(`  fetched at ${new Date().toISOString()}`);
  writeFileSync(`${outputDir}/drand-api-verification.json`, JSON.stringify({
    chain: DRAND_CHAIN_HASH,
    totalRounds: rounds.length,
    passed: apiPass,
    failed: apiFail,
    results: apiResults,
  }, null, 2));
  console.log(`  → outputs/drand-api-verification.json written\n`);

  // ── Summary ──
  console.log('\n══════════════════════════════════════════════');
  console.log('  TIMING SUMMARY');
  console.log('══════════════════════════════════════════════\n');
  console.log(`  Chain formula verified:         ${formulaPass}/${rounds.length}`);
  console.log(`  Server-side source rounds:      ${apiSourced}/${rounds.length}`);
  console.log(`  Bet placed before drand:        ${positive}/${rounds.length}`);
  console.log(`  Minimum margin:                 ${vals[0]}ms (${(vals[0] / 1000).toFixed(3)}s)`);
  console.log(`  drand API signatures matched:   ${apiPass}/${rounds.length}`);

  const pass = formulaFail === 0 && nonPositive === 0 && nullField === 0 && apiFail === 0;

  if (pass) {
    console.log('\n  VERDICT: PASS');
    console.log('  Every bet\'s operator timestamp precedes the publication');
    console.log('  of the drand beacon for that round. Measured from:');
    console.log('  1. betPlacedAt: timestamp_raw from /api/v2/user/transactions?type=roulette');
    console.log('  2. drandPublishedAt: computed locally from chain formula (genesis + (round-1) × 3s)');
    console.log('  3. commitmentBeforeDrand = drandPublishedAt × 1000 − betPlacedAt (ms)');
    console.log('  4. All ' + rounds.length + ' values are positive (min ' + vals[0] + 'ms, median ' + vals[Math.floor(vals.length / 2)] + 'ms)');
    console.log('  5. All ' + rounds.length + ' drand signatures matched byte-for-byte against drand.cloudflare.com');
    console.log('  Items 1, 3 and 4 rest on the operator\'s own clock (MANIFEST P5) and on the capture');
    console.log('  being a faithful record (P1); they time the bet, not when the server seed hash was');
    console.log('  shown (DL-3). Item 2 is public. Item 5 compares the beacon values with the public');
    console.log('  chain\'s by string equality; it does not time anything.');
  } else {
    console.log('\n  VERDICT: FAIL — see details above');
    process.exitCode = 1;
  }

  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exitCode = 1;
});
