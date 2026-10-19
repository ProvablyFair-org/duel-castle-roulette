/**
 * Duel.com Castle Roulette — RNG implementation.
 *
 * Algorithm (ported from Duel's published verification code, not rebuilt from a specification):
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
 * Baseline (wheel and paytable only): every color tier has EV = 1.000 exactly. Duel's settlement-stage
 *   edge is not in this file (MANIFEST.md, Payouts and RTP).
 * Nonce: always 0 — each round has its own unique server seed.
 *
 * OPERATOR SOURCE (since 2026-09-26): Duel's own Castle Roulette Verify-tab code, pasted by Paulo from
 * duel.com Verify tab on 2026-09-26, evidence/verify-tab/duel-verify-tab-castle-roulette-2026-09-26.js
 * (SHA-256 c83dca21…92bc7, pinned in src/operator-verifier.ts). "Lxx" is a line of that file. Every
 * citation is listed in OPERATOR_SOURCE_CITES and checked against the pinned bytes by Step 5 and the unit
 * tests, and Step 5 EXECUTES that file on every captured round. The payout table below is NOT in the
 * operator file — it computes the position only.
 */

import * as crypto from 'crypto';

/**
 * Each entry: a line of evidence/verify-tab/duel-verify-tab-castle-roulette-2026-09-26.js and text that
 * line must contain verbatim. src/operator-verifier.ts checkOperatorCites reads the pinned file and FAILs
 * any entry whose line does not carry its text.
 */
export const OPERATOR_SOURCE_CITES: ReadonlyArray<{ line: number; text: string; ports: string }> = Object.freeze([
  { line: 27, text: 'const keyBytes = hexToBytes(keyHex);', ports: 'HMAC key = hex-decoded server seed' },
  { line: 33, text: "{ name: 'HMAC', hash: 'SHA-256' },", ports: 'HMAC-SHA256' },
  { line: 46, text: "return new TextDecoder('utf-8').decode(bytes);", ports: 'drand hex → bytes → UTF-8 string (lossy, deterministic)' },
  { line: 49, text: 'const RANGE = 48; // 0-47 inclusive', ports: 'RANGE' },
  { line: 53, text: 'const nonce = 0;', ports: 'nonce always 0' },
  { line: 56, text: 'const message = new TextEncoder().encode(`${randomness}:${nonce}`);', ports: 'message = randomness:0' },
  { line: 61, text: 'const value = parseInt(hash.slice(0, 8), 16);', ports: 'first 4 bytes as uint32 (DRAW_HEX_CHARS = 8)' },
  { line: 62, text: 'return (value % RANGE).toString();', ports: 'position = value mod 48, no rejection (positionFromDigest)' },
]);

export const RANGE = 48;   // operator L49

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
  return positionFromDigest(hmac);
}

/** Hex characters of the digest the draw reads: 8 = one uint32. drawBiasBound reads this constant. */
export const DRAW_HEX_CHARS = 8;

/**
 * THE DRAW — the one place the digest becomes a position: the first DRAW_HEX_CHARS hex characters
 * as an unsigned integer, reduced mod RANGE with no rejection. drawBiasBound probes THIS function,
 * so a change to the reduction the recomputation runs is a change to the bound Step 5 prints.
 */
export function positionFromDigest(hmacHex: string): number {
  const value = parseInt(hmacHex.slice(0, DRAW_HEX_CHARS), 16);
  return value % RANGE;
}

/**
 * THE DRAW BIAS BOUND (profile CASTLE-08, rule R1 — added 2026-09-26). A plain `v % 48` over a
 * 2^(4·DRAW_HEX_CHARS)-value domain is not exactly uniform: the first `domain mod 48` positions
 * receive one extra value each. The bound is computed from the domain size and RANGE, and ~200
 * probes confirm positionFromDigest IS "leading DRAW_HEX_CHARS hex digits mod RANGE" on digests
 * built to separate a 32-bit read from any other width (e.g. '00000001…' → 1 only if 8 characters
 * are read). Returns the per-position absolute and relative bias and the per-tier EV effect.
 */
export function drawBiasBound(): {
  domainSize: number; range: number; remainder: number; favouredPositions: number;
  perPositionAbsoluteBias: number; relativeBias: number; predicateProbeFailures: number;
  evByTier: Record<string, number>; maxEvDeviation: number;
} {
  const domainSize = 2 ** (4 * DRAW_HEX_CHARS);
  const base = Math.floor(domainSize / RANGE);
  const remainder = domainSize % RANGE;
  // |P(favoured) − 1/RANGE| = ((base+1)·RANGE − domain) / (domain·RANGE); integers < 2^53, one division
  const perPositionAbsoluteBias = remainder === 0 ? 0
    : Math.max((base + 1) * RANGE - domainSize, domainSize - base * RANGE) / (domainSize * RANGE);
  const relativeBias = remainder === 0 ? 0 : 1 / base;
  let predicateProbeFailures = 0;
  const pad = (hex: string) => (hex + '0'.repeat(64)).slice(0, 64);
  const probe = (v: number) => {
    const hex = v.toString(16).padStart(8, '0');
    // the value in the leading 8 hex characters, followed by non-zero noise that a wider read would pick up
    const digest = pad(hex + 'f3a5c7e9'.repeat(7));
    if (positionFromDigest(digest) !== v % RANGE) predicateProbeFailures++;
  };
  for (let d = 0; d < 100; d++) { probe(d); probe(0xFFFFFFFF - d); }
  for (let k = 1; k < 100; k++) probe(Math.floor(k * (2 ** 32 / 100)) + k);
  const evByTier: Record<string, number> = {};
  for (let p = 0; p < RANGE; p++) {
    const t = PAYOUT_TABLE[p];
    evByTier[t.color] = (evByTier[t.color] ?? 0) + ((p < remainder ? base + 1 : base) / domainSize) * t.multiplier;
  }
  const maxEvDeviation = Math.max(...Object.values(evByTier).map(ev => Math.abs(ev - 1)));
  return { domainSize, range: RANGE, remainder, favouredPositions: remainder, perPositionAbsoluteBias,
    relativeBias, predicateProbeFailures, evByTier, maxEvDeviation };
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
