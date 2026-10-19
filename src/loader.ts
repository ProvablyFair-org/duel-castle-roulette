import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { RouletteDataset } from './types';

const DATASET_PATH  = path.join(__dirname, '../data/castle-roulette-master-1350rounds.json');
const EXPECTED_HASH = '506e05ee9c07966a721715cd7d7b369e72159601b6a6439542330b311ffd66ce';

// ── POPULATION OF RECORD ──────────────────────────────────────────────────────
// The capture plan stated as CODE, next to the dataset pin, so the scored steps have
// something to check the data against that the data does not control. The file carries
// its own counts in meta.enrichment; reconciling against those would prove nothing,
// because deleting rounds and editing the header together leaves a file that is
// internally consistent and re-pins cleanly — and re-pinning is what a forger does. The
// phase counts used to be inlined in tests/steps/payouts.ts, out of reach of every other
// step; every step with a count to check now checks it against these.
export const EXPECTED_ROUNDS = 1350;
export const EXPECTED_PHASE_ROUNDS: Readonly<Record<string, number>> =
  Object.freeze({ A: 800, B: 200, C: 100, D: 100, E: 150 });

// Castle Roulette has no seed rotation and therefore NO EPOCHS: each round carries its
// own server seed and commitment hash, the seed revealed after the round (when the hash was
// first shown is not established by this capture, MANIFEST DL-3), and all
// 1,350 are distinct. There is no epoch size to assert and no next-seed chain to walk —
// the ordering property this game has is drand round monotonicity (Step 3): no beacon round
// reused or out of order. It does not stop a server choosing which later beacon a round uses;
// advance beacon selection is not verified (MANIFEST Step 3 and Limitations).
export const EXPECTED_DISTINCT_SEEDS    = 1350;
export const EXPECTED_DRAND_TRANSITIONS = 1349;

// Rounds where the RECOMPUTED tier equals request.coin (measured 2026-10-04 on the pinned dataset:
// 432 at $0.01, 41 at $1.00). Step 9 checks the served credit on exactly these rounds.
export const EXPECTED_WINNING_ROUNDS = 473;

// Every timing margin in this capture is anchored to a server-side timestamp from the
// transactions API. A 'capture-only' timestamp is the client's own clock and is much
// weaker evidence that the bet preceded the beacon, so the count is pinned rather than left to vary.
export const EXPECTED_TIMING_SOURCE = 'transactions-api';
export const EXPECTED_ROUNDS_WITH_SERVER_TIMESTAMP = 1350;

// The coin tier is the one configuration dimension: six colours, six multipliers. The
// smallest group holds 33 rounds, so a floor of 30 fails on a tier reduced to a token
// sample while leaving the honest capture passing. The wheel itself has 48 positions and
// this capture landed on every one of them.
export const EXPECTED_COIN_TIERS: readonly string[] =
  Object.freeze(['two', 'four', 'eight', 'sixteen', 'twenty_four', 'forty_eight']);
export const MIN_ROUNDS_PER_COIN_TIER = 30;
export const WHEEL_POSITIONS = 48;

// Live-sample fit (profile CASTLE-22, Step 19, added 2026-09-26): family level for the informational fits.
export const LIVE_FIT_ALPHA = 0.01;

export function getDatasetPath(): string { return DATASET_PATH; }

export function loadDataset(): RouletteDataset {
  const raw = fs.readFileSync(DATASET_PATH, 'utf-8');
  return JSON.parse(raw) as RouletteDataset;
}

export function checkDatasetHash(): { expected: string; actual: string; match: boolean } {
  const raw = fs.readFileSync(DATASET_PATH);
  const actual = crypto.createHash('sha256').update(raw).digest('hex');
  // FAIL-OPEN REMOVED. `EXPECTED_HASH.length === 0 || …` meant that emptying the pin made every
  // dataset match — the one edit a forger would make first. An unset pin is a broken audit, not a
  // passing one.
  const match = EXPECTED_HASH.length === 64 && actual === EXPECTED_HASH;
  return { expected: EXPECTED_HASH, actual, match };
}

/** drand quicknet chain constants. */
export const DRAND_GENESIS = 1692803367;
export const DRAND_PERIOD  = 3;

/** Compute drand publish time from round number (unix seconds). */
export function drandPublishTime(round: number): number {
  return DRAND_GENESIS + (round - 1) * DRAND_PERIOD;
}
