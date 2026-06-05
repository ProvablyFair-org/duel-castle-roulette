import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { RouletteDataset } from './types';

const DATASET_PATH  = path.join(__dirname, '../data/castle-roulette-master-1350rounds.json');
const EXPECTED_HASH = '506e05ee9c07966a721715cd7d7b369e72159601b6a6439542330b311ffd66ce';

export function getDatasetPath(): string { return DATASET_PATH; }

export function loadDataset(): RouletteDataset {
  const raw = fs.readFileSync(DATASET_PATH, 'utf-8');
  return JSON.parse(raw) as RouletteDataset;
}

export function checkDatasetHash(): { expected: string; actual: string; match: boolean } {
  const raw = fs.readFileSync(DATASET_PATH);
  const actual = crypto.createHash('sha256').update(raw).digest('hex');
  const match = EXPECTED_HASH.length === 0 || actual === EXPECTED_HASH;
  return { expected: EXPECTED_HASH, actual, match };
}

/** drand quicknet chain constants. */
export const DRAND_GENESIS = 1692803367;
export const DRAND_PERIOD  = 3;

/** Compute drand publish time from round number (unix seconds). */
export function drandPublishTime(round: number): number {
  return DRAND_GENESIS + (round - 1) * DRAND_PERIOD;
}
