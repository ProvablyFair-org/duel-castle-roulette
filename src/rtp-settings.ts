/**
 * RTP-CLAIM wiring — Duel Castle Roulette: the per-setting exact RTP table and the claim it is held to.
 *
 * The rule is src/rtp-claim.ts, a byte-identical copy of the framework's core/rtp-claim.ts (its
 * SHA-256 is compared by conformance C-13), version 1.2.0 (Methodology v1.1, agreed 2026-10-14;
 * 1.0.0 agreed on Slack 2026-09-29). The enforcement switch RTP_CLAIM_RULE_ENFORCED is the
 * package's own src/rtp-claim-switch.ts, set to true (decision D3).
 *
 * SETTINGS. The six colour tiers a player can back (src/rng.ts PAYOUT_TABLE): Green 48×, Red 24×,
 * Purple 16×, Blue 8×, Grey 4×, Dark Blue 2×.
 * EXACT RTP. The position is the leading 8 hex digits (a uint32) mod 48 with no rejection
 * (src/rng.ts positionFromDigest), so position p is hit by floor(2^32/48) + [p < 2^32 mod 48]
 * of the 2^32 values; RTP(tier) = (Σ over the tier's positions of that count) / 2^32 × multiplier.
 * CLAIM. Noted, not tested (rule 1.2.0, decision D3: "rakeback/zero-edge/promos/site-wide lines noted
 * not tested"). Until 14 October 2026 the claim was flat RTP 1, the zero settlement edge measured on
 * all 473 winning rounds (Step 9). That figure is Duel's Zero Edge allowance, not a figure the game
 * settings state: the game settings (E10, GET /api/v2/metadata/roulette, fetched 2026-10-05) state the
 * settlement edge beyond the allowance, a 0.1% floor (min_house_edge_limit) and a 5% ceiling
 * (max_house_edge_limit), computed per stake by Duel's client code (MANIFEST.md#payouts-and-rtp). So
 * the claim is kind 'noted': the six colour tiers are still tabled (true range, every row), none is
 * held to a figure, outcome NOTED, status INFO whether or not the rule is enforced. Scope: the
 * game-engine baseline at the captured stakes ($0.01 and $1.00, under the Zero Edge cap) — the
 * settlement-stage edge above the per-bet cap is not exercised by any captured stake (DL-5).
 *
 *   npm run rtp-claim:write    rewrite outputs/rtp-claim-table.json and print its SHA-256 to pin
 */
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { RtpClaim, RtpClaimAccumulator, RtpClaimResult, rtpClaimTable, rtpClaimGate, RtpClaimGate } from './rtp-claim';
import { RANGE, PAYOUT_TABLE, DRAW_HEX_CHARS } from './rng';

export const RTP_CLAIM: RtpClaim = {
  kind: 'noted',
  source: 'game page: the "Zero Edge" label on the Castle Roulette screen (E05, evidence/E01-castle-roulette-game-ui.png); the allowance ceilings ($1,000 per bet, $50,000 per 24 h) are Duel engineering\'s verbal disclosure and are not in E10 (MANIFEST.md#payouts-and-rtp); game settings: GET /api/v2/metadata/roulette (E10, fetched 2026-10-05) states the settlement edge beyond the allowance, min_house_edge_limit 0.1 and max_house_edge_limit 5 (%), which no captured stake reached (DL-5)',
  text: 'Zero Edge: no settlement edge on up to $1,000 of a bet, within $50,000 of wager per 24 hours; served credit = stake × table multiplier on all 473 winning rounds captured (Step 9)',
};

/** The scored step that carries the derived half of CASTLE-19 (src/profile-map.ts). */
export const RTP_CLAIM_STEP = 13;

export const RTP_CLAIM_TABLE = path.join(__dirname, '..', 'outputs', 'rtp-claim-table.json');
/** SHA-256 of the committed table — re-pin with the run that rewrote it (npm run rtp-claim:write). */
export const RTP_CLAIM_TABLE_SHA256 = 'd633c433749651e9995526cdd8091bf053695da17c73a037a6a1a19b696446f8';

export function computeRtpClaim(): RtpClaimResult {
  const domain = 1n << BigInt(4 * DRAW_HEX_CHARS);     // 2^32
  const R = BigInt(RANGE);
  const base = domain / R, extra = domain % R;
  const tiers = new Map<string, { mult: number; count: bigint }>();
  PAYOUT_TABLE.forEach((cell, p) => {
    const t = tiers.get(cell.color) ?? { mult: cell.multiplier, count: 0n };
    if (t.mult !== cell.multiplier) throw new Error(`tier ${cell.color} carries two multipliers`);
    t.count += base + (BigInt(p) < extra ? 1n : 0n);
    tiers.set(cell.color, t);
  });
  if (PAYOUT_TABLE.length !== RANGE) throw new Error('payout table does not cover the wheel');
  const acc = new RtpClaimAccumulator(RTP_CLAIM);
  for (const [color, t] of tiers) acc.add(`tier=${color} (${t.mult}x)`, t.count * BigInt(t.mult), domain);
  return acc.result();
}

export function rtpClaimTableText(r: RtpClaimResult): string {
  return rtpClaimTable(r, {
    package: 'duel/castle-roulette', game: 'castle-roulette',
    settingSpace: 'the six colour tiers (Green 48×, Red 24×, Purple 16×, Blue 8×, Grey 4×, Dark Blue 2×)',
    rtpMethod: 'exact rational: uint32 counts per position (floor(2^32/48) + [p < 16]) summed over the tier / 2^32 × multiplier',
  });
}

export function runRtpClaimGate(): RtpClaimGate {
  const r = computeRtpClaim();
  return rtpClaimGate(r, rtpClaimTableText(r), RTP_CLAIM_TABLE, RTP_CLAIM_TABLE_SHA256);
}

if (require.main === module) {
  const text = rtpClaimTableText(computeRtpClaim());
  fs.writeFileSync(RTP_CLAIM_TABLE, text);
  console.log(`wrote outputs/rtp-claim-table.json sha256 ${createHash('sha256').update(text).digest('hex')}`);
}
