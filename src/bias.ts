/**
 * THE DRAW BIAS BOUND (profile CASTLE-08, rule R1 — added 2026-09-26; moved here from src/rng.ts on
 * 20 Oct 2026 when src/rng.ts was replaced by the clean-room rebuild).
 *
 * This is the auditor's own measurement code, not Duel's and not part of the game's derivation. It is
 * built ON TOP of src/rng.ts: it reads that module's RANGE, DRAW_HEX_CHARS and PAYOUT_TABLE, and it
 * probes that module's positionFromDigest, the one place the digest becomes a position. So the bound
 * measures the draw the recomputation actually runs; a change to that draw is a change to what Step 5
 * prints.
 *
 * A plain `v % 48` over a 2^(4·DRAW_HEX_CHARS)-value domain is not exactly uniform: the first
 * `domain mod 48` positions receive one extra value each. The bound is computed from the domain size
 * and RANGE, and ~300 probes confirm positionFromDigest IS "leading DRAW_HEX_CHARS hex digits mod
 * RANGE" on digests built to separate a 32-bit read from any other width (e.g. '00000001…' → 1 only
 * if 8 characters are read), and on the top values of the domain, where a rejection draw would differ.
 * Returns the per-position absolute and relative bias and the per-tier EV effect.
 */

import { RANGE, PAYOUT_TABLE, DRAW_HEX_CHARS, positionFromDigest } from './rng';

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
