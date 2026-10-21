/**
 * PROVENANCE (header added on integration, 20 Oct 2026; everything below this comment is the
 * clean-room module byte for byte).
 *
 * This module was REBUILT FROM A WRITTEN SPECIFICATION, not ported from Duel's code:
 *   spec      docs/ALGORITHM.md, a copy of games/castle-roulette/ALGORITHM.md in the ProvablyFair.org
 *             audit framework (pf-audit, branch clean-room-spec-2026-10-20, commit 2dbffe4). Written
 *             from Duel's public pages, black-box readings of Duel's public Verify page, the standard
 *             provably-fair construction, the public drand beacon and the 1,350 live rounds, without
 *             opening Duel's code (its §8 lists every file read).
 *   rebuild   written by an implementer who read ONLY that spec and a module-interface file, and
 *             never opened Duel's code, its Verify-tab file, or this package's earlier src/rng.ts.
 *   self-test tests/castle-roulette/RngSpecTests.ts (the spec's §1.3–§5 vectors and properties).
 *
 * Duel's published Verify-tab code (evidence/verify-tab/duel-verify-tab-castle-roulette-2026-09-26.js)
 * is NOT the source of this module. It is run byte for byte as a SECOND CHECK, by Step 5 and the unit
 * tests (src/operator-verifier.ts), next to the ProvablyFair.org docs-site verifier.
 *
 * Three-way agreement measured on integration (20 Oct 2026, the 1,350-round capture): this module vs
 * the live rounds, commitment / position / multiplier / winning coin / win flag / amount won
 * 1,350/1,350 each; vs Duel's Verify-tab code 1,350/1,350 positions; vs the provablyfair.org live
 * verifier: not measured, this package has no live-site leg. Spec open point O2 (plain mod 48 vs
 * rejection): the spec's §5.3 probe (server seed 0…161fff60, drand seed of §5.1 V1) run through
 * Duel's Verify-tab code returns 4, the plain-mod answer, which is what this module computes.
 * Step 5 of `npm run verify` re-measures the live and Verify-tab legs on every run.
 */
// Castle Roulette position draw, written from ALGORITHM.md only (clean room).
// Node `crypto` only. Section numbers below refer to ALGORITHM.md.

import { createHash, createHmac } from 'crypto';

// §1.1 / §3.1: the wheel has 48 positions.
export const RANGE: number = 48;

// §2.3: the draw reads the first 4 bytes of the HMAC digest = 8 hex characters.
// Plain `mod 48` is implemented, as §2.3 instructs while O2 is open, so no
// further chunk is ever read.
export const DRAW_HEX_CHARS: number = 8;

// §3.1: position -> tier. Colour labels are the package convention from INTERFACE.md.
// Every tier satisfies (number of positions) x multiplier = 48 (§3.1).
const TIERS: ReadonlyArray<{ from: number; to: number; multiplier: number; color: string }> = [
  { from: 0, to: 0, multiplier: 48, color: 'green' },
  { from: 1, to: 2, multiplier: 24, color: 'red' },
  { from: 3, to: 5, multiplier: 16, color: 'purple' },
  { from: 6, to: 11, multiplier: 8, color: 'blue' },
  { from: 12, to: 23, multiplier: 4, color: 'grey' },
  { from: 24, to: 47, multiplier: 2, color: 'dark_blue' },
];

export const PAYOUT_TABLE: Array<{ multiplier: number; color: string }> = (() => {
  const table: Array<{ multiplier: number; color: string }> = [];
  for (let p = 0; p < RANGE; p++) {
    const tier = TIERS.find((t) => p >= t.from && p <= t.to);
    if (!tier) throw new Error(`no tier for position ${p}`);
    table.push({ multiplier: tier.multiplier, color: tier.color });
  }
  return table;
})();

// §2.1: hex decoding as Duel's Verify page reads it. Real rounds always carry
// valid lowercase hex, for which this is identical to standard decoding. For
// crafted input the spec observed: case-insensitive; a trailing odd nibble is
// dropped; a pair that is not valid hex reads as a zero byte.
function decodeHex(input: string): Buffer {
  const whole = Math.floor(input.length / 2);
  const out = Buffer.alloc(whole);
  for (let i = 0; i < whole; i++) {
    const pair = input.slice(i * 2, i * 2 + 2);
    out[i] = /^[0-9a-fA-F]{2}$/.test(pair) ? parseInt(pair, 16) : 0;
  }
  return out;
}

// §2.2: message = the drand signature bytes decoded as UTF-8 with WHATWG
// replacement (each maximal invalid subsequence -> U+FFFD), re-encoded as
// UTF-8, followed by the two ASCII bytes ":0". TextDecoder is non-fatal by
// default, which is the replacement behaviour the spec names (O5).
function buildMessage(drandBytes: Buffer): Buffer {
  const text = new TextDecoder('utf-8').decode(drandBytes);
  return Buffer.concat([Buffer.from(text, 'utf8'), Buffer.from(':0', 'ascii')]);
}

// §2.3: first 4 digest bytes as an unsigned big-endian integer, then mod 48.
export function positionFromDigest(hmacHex: string): number {
  if (!/^[0-9a-fA-F]+$/.test(hmacHex) || hmacHex.length < DRAW_HEX_CHARS) {
    throw new Error('digest must be hex with at least 8 characters');
  }
  const u = parseInt(hmacHex.slice(0, DRAW_HEX_CHARS), 16);
  return u % RANGE;
}

// §2.3: HMAC-SHA256 keyed by the decoded server seed, over the §2.2 message.
export function computePositionFromBuffer(keyBuffer: Buffer, drandSeed: string): number {
  const drandBytes = decodeHex(drandSeed); // §2.1
  // §5.2: with no whole byte in the input the Verify page shows no result.
  if (drandBytes.length === 0) throw new Error('drandSeed decodes to zero bytes');
  const message = buildMessage(drandBytes); // §2.2
  const digest = createHmac('sha256', keyBuffer).update(message).digest('hex'); // §2.3
  return positionFromDigest(digest);
}

// §2.1 + §2.3: decode the server seed to bytes and use them as the HMAC key.
export function computePosition(serverSeed: string, drandSeed: string): number {
  const key = decodeHex(serverSeed);
  if (key.length === 0) throw new Error('serverSeed decodes to zero bytes');
  return computePositionFromBuffer(key, drandSeed);
}

// §3.1: tier for a position.
export function getResult(position: number): { multiplier: number; color: string } {
  if (!Number.isInteger(position) || position < 0 || position >= RANGE) {
    throw new Error(`position out of range: ${position}`);
  }
  return PAYOUT_TABLE[position];
}

// §1.3: commitment is SHA-256 over the 32 hex-decoded seed bytes, lowercase hex.
export function verifyHash(serverSeed: string, serverSeedHash: string): boolean {
  const computed = createHash('sha256').update(decodeHex(serverSeed)).digest('hex');
  return computed === serverSeedHash.toLowerCase();
}

// §2.3: exact bias of plain `u mod 48` over u uniform in [0, 2^32).
// 2^32 = 48*q + r. Residues below r get q+1 preimages, the rest get q.
export function moduloBias(): { maxBiasPerPosition: number; affectedPositions: number } {
  const space = 2 ** 32;
  const q = Math.floor(space / RANGE);
  const r = space - q * RANGE; // 16
  // Work in counts to keep the difference exact before dividing by 2^32:
  // favoured positions: (q+1) - space/48 = 1 - r/48; others: q - space/48 = -r/48.
  const favouredExcess = (1 - r / RANGE) / space;
  const otherDeficit = (r / RANGE) / space;
  return {
    maxBiasPerPosition: Math.max(Math.abs(favouredExcess), Math.abs(otherDeficit)),
    affectedPositions: r,
  };
}
