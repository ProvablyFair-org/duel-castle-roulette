/**
 * Duel.com Castle Roulette — RNG implementation.
 *
 * Algorithm (from Duel's published verification code):
 *   1. drandSeed (96-char hex BLS signature) → hex-decode to bytes → UTF-8 string
 *   2. message = UTF8(drandBytes) + ":0"    (nonce is always 0)
 *   3. hash = HMAC-SHA256(key = hex_bytes(serverSeed), message)
 *   4. value = parseInt(hash[0..7], 16)     (first 4 bytes as uint32)
 *   5. position = value % 48               (0-47)
 *
 * Key encoding: Buffer.from(serverSeed, 'hex') — hex-decoded bytes, NOT UTF-8.
 * Drand encoding: hex-decode to raw bytes, then .toString('utf-8') — lossy but
 *   deterministic (same on server and verifier). This is the BLS signature field
 *   from the drand quicknet chain.
 * House edge: 0% — every color tier has EV = 1.000 exactly.
 * Nonce: always 0 — each round has its own unique server seed.
 */

import * as crypto from 'crypto';

export const RANGE = 48;

/** Payout table: position → { multiplier, color } */
export const PAYOUT_TABLE: Array<{ multiplier: number; color: string }> = (() => {
  const table: Array<{ multiplier: number; color: string }> = [];
  // Position 0: Green 48×
  table.push({ multiplier: 48, color: 'green' });
  // Position 1-2: Red 24×
  for (let i = 1; i <= 2; i++) table.push({ multiplier: 24, color: 'red' });
  // Position 3-5: Purple 16×
  for (let i = 3; i <= 5; i++) table.push({ multiplier: 16, color: 'purple' });
  // Position 6-11: Blue 8×
  for (let i = 6; i <= 11; i++) table.push({ multiplier: 8, color: 'blue' });
  // Position 12-23: Grey 4×
  for (let i = 12; i <= 23; i++) table.push({ multiplier: 4, color: 'grey' });
  // Position 24-47: Dark Blue 2×
  for (let i = 24; i <= 47; i++) table.push({ multiplier: 2, color: 'dark_blue' });
  return table;
})();

/**
 * Compute the roulette position from a server seed and drand randomness.
 * Returns position 0-47.
 */
export function computePosition(serverSeed: string, drandSeed: string): number {
  const keyBuffer = Buffer.from(serverSeed, 'hex');
  return computePositionFromBuffer(keyBuffer, drandSeed);
}

/**
 * Compute position from pre-decoded key buffer (for simulation hot path).
 */
export function computePositionFromBuffer(keyBuffer: Buffer, drandSeed: string): number {
  const drandBytes = Buffer.from(drandSeed, 'hex');
  const randomness = drandBytes.toString('utf-8'); // lossy hex→bytes→utf8 (same as Crash)
  const message = `${randomness}:0`;

  const hmac = crypto.createHmac('sha256', keyBuffer).update(message).digest('hex');
  const value = parseInt(hmac.slice(0, 8), 16);

  return value % RANGE;
}

/**
 * Get color and multiplier for a position.
 */
export function getResult(position: number): { multiplier: number; color: string } {
  if (position < 0 || position >= RANGE) throw new Error(`Invalid position: ${position}`);
  return PAYOUT_TABLE[position];
}

/**
 * SHA-256 commit-reveal: verify SHA-256(hex_bytes(serverSeed)) === serverSeedHash.
 */
export function verifyHash(serverSeed: string, serverSeedHash: string): boolean {
  const seedBytes = Buffer.from(serverSeed, 'hex');
  const computed = crypto.createHash('sha256').update(seedBytes).digest('hex');
  return computed === serverSeedHash;
}

/**
 * Modulo bias analysis for value % 48.
 * 2^32 = 89478485 × 48 + 16
 * Positions 0-15 each have probability 89478486/2^32 (16 favored)
 * Positions 16-47 each have probability 89478485/2^32 (32 unfavored)
 * Per-favored-position bias (precise): 32/(48 × 2^32) = 1.55 × 10^-10
 * Structural upper bound for any uint32 mod-N: 1/2^32 ≈ 2.33 × 10^-10
 */
export function moduloBias(): { maxBiasPerPosition: number; affectedPositions: number } {
  const total = 2 ** 32;
  const base = Math.floor(total / RANGE);    // 89478485
  const remainder = total % RANGE;           // 16
  const highProb = (base + 1) / total;
  const lowProb = base / total;
  const fairProb = 1 / RANGE;
  return {
    maxBiasPerPosition: Math.abs(highProb - fairProb),
    affectedPositions: remainder,  // positions 0-15 are slightly favored
  };
}
