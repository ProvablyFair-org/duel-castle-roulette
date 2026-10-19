# Duel Castle Roulette — Consolidated Audit Overview

**Audit ID:** PF-2026-DL07 · **Auditor:** ProvablyFair.org · **Release:** `v1.1.0` · **Framework:** 1.1

Audit date: April 2026. Dataset of record: **1,350 rounds** captured from `2026-04-22T02:20:49.763Z` to `2026-04-23T02:29:27.407Z`. Original publication: 4 June 2026. Audit report: https://audit.provablyfair.org/casino/duel/games/castle-roulette/overview. This overview consolidates the package documentation as of 4 October 2026. The machine-readable release identity remains in [RELEASE-MANIFEST.json](RELEASE-MANIFEST.json).

## Conclusion and scope

**PROVABLY FAIR — Full Pass:** 19 scored verification steps, 19 PASS, 0 flags, 0 hard fails. Every roulette position in the 1,350-round dataset was reproduced from `(serverSeed, drandSignature)` using HMAC-SHA256 with the drand quicknet chain as external entropy, by position code ported from Duel's published verification code and checked against Duel's Verify-tab code (Step 5). All 1,350 drand signatures were verified against the public beacon API. All 1,350 payouts follow the position → colour-tier table, and the capture-recorded `isWin` flags agree with it.

**The wheel and paytable give a baseline RTP of 100.0000%** by the `count × multiplier = 48` identity on every colour tier, before any settlement-stage edge. Per Duel's disclosure, a settlement-stage Zero Edge discount mechanism applies. Its formula and order are read from Duel's client code (`useRouletteScalingEdge-aDyPphv5.js` as served 2026-10-05, which computes the edge the UI displays; server settlement not observed), with the parameters served at `/api/v2/metadata/roulette` in the duel.com config as fetched 2026-10-05 in a logged-in session (read-only GET; E10) and the allowance ceilings Duel stated; at a $25,000 stake the formula reproduces the per-tile edge on the five tiles that show one in a live-UI screenshot received on 22 May 2026 (4× to 48×); the 2× tile showed none, where the client code gives 0.1%. All 473 winning rounds were credited the full multiplier, a settlement edge of 0; the captured stakes ($0.01 and $1.00, total wagered $112.50) all fall under the $1,000 per-bet allowance. Larger stakes are outside this audit's empirical scope, and the settlement parameters are operator-tunable.

Observed return over 1,350 rounds is 83.77%: $94.24 credited on $112.50 staked, a $18.26 shortfall. $18.00 of that shortfall comes from Phase C, the 100 bets of $1.00 on 2×, which won 41 times against 50 expected (exact binomial, two-sided p = 0.089). Without Phase C the observed return is 97.92% ($12.24 credited on $12.50 staked). The 16× and 48× bets staked $3.16 between them and were credited $2.72, a $0.44 shortfall. The 100% baseline is established analytically and by simulation; finite-sample returns are informational.

The bet-before-beacon ordering is measured on the operator's transactions-API bet timestamp against the public chain formula; the server-seed hash itself was not preserved as a timed pre-round observation (DL-3). Step 3 shows the drand round IDs increase, which is ordering only; advance beacon selection (the server choosing which later beacon a round uses) was not verified. The capture used one test account. These are recorded below as limits on what the evidence shows, not as findings against the operator.

## Contents

- [Dataset and capture](#dataset-and-capture)
- [Game and algorithm](#game-and-algorithm)
- [Payouts and RTP](#payouts-and-rtp)
- [Verification results](#verification-results)
- [Reproduce the audit](#reproduce-the-audit)
- [Verify a bet](#verify-a-bet)
- [Evidence](#evidence)
- [Limitations and trust](#limitations-and-trust)
- [Terms](#terms)
- [Release history](#release-history)

## Dataset and capture

Live round data was captured via browser session during active play on Duel.com Castle Roulette using a test account funded by ProvablyFair.org. The game client connects to `wss://roulette.duel.com` on the `/roulette` namespace; each round's lifecycle messages were intercepted, including the server seed hash, round state transitions, position result, revealed server seed, drand round ID and drand signature. [capture/castle-roulette-capture.reference.js](capture/castle-roulette-capture.reference.js) records the capture method; it is a reference record, not a runnable tool. The runnable capture script is `capture/castle-roulette-capture.js` (558 lines, pasted into the browser console on duel.com): it places the bets, records the WebSocket messages and, in its `save()`, runs the enrichment step described next and writes the dataset's `meta.schema` (`duel-castle-roulette-capture`) and `meta.enrichment` fields. The copy kept is the one in the working copy's first commit (20 May 2026, after the capture), with one comment line changed on 19 September 2026. ProvablyFair.org keeps it in its working copy; the release does not carry it, because Duel releases ship capture tools only as reference records (the runnable tools place bets on duel.com), so the two `*.reference.js` files stand in for it.

After capture, each round was enriched from Duel's transactions API (`/api/v2/user/transactions`), which supplies `timestamp_raw`, the operator's database timestamp for the bet, and the bet's served `multiplier`, stake (`amountCurrency`) and credit (`amountWon`, from the bet's related transaction; `"0"` when it has none). 1,350/1,350 rounds were matched by drand round id and the colour bet, or the only transaction on that drand round (the enrichment's fallback; the dataset does not record which path a round took), and use the `transactions-api` timing source. [capture/castle-roulette-enrich.reference.js](capture/castle-roulette-enrich.reference.js) records the enrichment step. Where the matched transaction carried them, the same step also overwrote `result.serverSeed`, `result.serverSeedHash` and `result.drandRandomness` with the transaction's values (lines 100–102 of that file); the dataset does not record for which rounds, if any, it did. The stored hash may therefore be the one the capture read from the `rolling` message, from `roll` or `end` when `rolling` carried none, or from the transactions API, and no receipt time for it was kept. Two `result.*` fields are written by the capture script, not served: `result.isWin` (the served `winningCoin` compared with the coin bet) and `result.effectiveEdge` (the literal 0).

| Phase | Rounds | Stake | Colour bet | Purpose |
|---|---:|---:|---|---|
| A | 800 | $0.01 | 2× (Dark Blue) | Baseline statistical coverage |
| B | 200 | $0.01 | All 6 colours (rotating) | Multi-tier payout validation |
| C | 100 | $1.00 | 2× (Dark Blue) | Bet-size invariance test |
| D | 100 | $0.01 | 16× (Purple) | Rare-tier payout coverage |
| E | 150 | $0.01 | 48× (Green) | Rare-tier payout coverage |

Total wagered: Phase A $8.00, Phase B $2.00, Phase C $100.00, Phase D $1.00, Phase E $1.50; $112.50 in all. Round IDs 538493 to 541353; drand rounds 28007049 to 28035974. 1,350 unique server seeds and 1,350 unique hashes: one per round, no epochs, no nonces. The phase counts are declared as code in `src/loader.ts`, which every population-bound step compares against, not the dataset header.

| Input | Identity |
|---|---|
| [data/castle-roulette-master-1350rounds.json](data/castle-roulette-master-1350rounds.json) | SHA-256 `506e05ee9c07966a721715cd7d7b369e72159601b6a6439542330b311ffd66ce` |

The verification suite checks this hash at startup; Step 11 scores a mismatch as a FAIL. The wheel table is code in `src/rng.ts`; there is no separate configuration file.

## Game and algorithm

Castle Roulette is a multiplayer 48-position wheel (E05). Each round is a shared event: the server commits a seed hash, players bet on one of six colours during the betting window, one drand beacon arrives after betting closes, and the position is computed once for everyone. Individual results depend only on the colour each player chose. There is no client seed, no nonce sequence and no seed rotation.

| Colour | Positions | Count | Multiplier | `request.coin` | P(colour) | P × multiplier |
|---|---|---:|---:|---|---|---:|
| Green | 0 | 1 | 48× | `forty_eight` | 1/48 | 1.000 |
| Red | 1–2 | 2 | 24× | `twenty_four` | 2/48 | 1.000 |
| Purple | 3–5 | 3 | 16× | `sixteen` | 3/48 | 1.000 |
| Blue | 6–11 | 6 | 8× | `eight` | 6/48 | 1.000 |
| Grey | 12–23 | 12 | 4× | `four` | 12/48 | 1.000 |
| Dark Blue | 24–47 | 24 | 2× | `two` | 24/48 | 1.000 |

### Round lifecycle and drand

Each round runs `rolling → bet → spin → waiting-pf → roll → end`. In **rolling** the server broadcasts the round ID and the server seed hash; **bet** opens the betting window; **spin** closes it; in **waiting-pf** the server waits for a drand beacon (the rule that pairs a round with a beacon is not published; see residual operator trust); **roll** computes and broadcasts the position with the revealed server seed, drand round ID and signature; **end** settles payouts.

| drand quicknet parameter | Value |
|---|---|
| Chain hash | `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971` |
| Genesis | 1692803367 (Unix seconds; 2023-08-23T12:02:47Z) |
| Period | 3 seconds |
| Signature | BLS on G1, 48 bytes (96 hex characters) |
| API used by the audit | `https://drand.cloudflare.com/{chainHash}/public/{round}` |

The publication time of any beacon is `drandPublishedAt = 1692803367 + (round − 1) × 3`. Step 12 checks this for all 1,350 rounds.

### Position algorithm

The algorithm in [src/rng.ts](src/rng.ts) was ported from Duel's published verification code, not rebuilt from a specification: its header has said "from Duel's published verification code" since the original audit, and since 26 September 2026 it cites 8 lines of the copy kept as E09 and is checked against that code on every captured round (Step 5). A port can carry over a mistake in Duel's code that a rebuild from a specification could catch. The algorithm:

```text
key        = hex_decode(serverSeed)                  // 32 bytes, not the 64-character text
drandBytes = hex_decode(drandRandomness)             // 48 bytes
message    = drandBytes.toString('utf-8') + ":0"     // lossy but deterministic; nonce always 0
hmac       = HMAC-SHA256(key, message)
value      = parseInt(hmac[0..7], 16)                // first 4 bytes as a uint32
position   = value % 48                              // 0–47, no rejection
colour     = wheelMap[position]
```

Most of the 48 beacon bytes are not valid UTF-8; Node.js replaces invalid sequences with U+FFFD. The conversion is deterministic, so the server and every verifier build the same message. The message always ends in `:0` because each round has its own seed.

**Worked example, round 538493.** Server seed `adace83dfe4957273152c5c52aea5e4fc112dabef87ff4baa350ca652420eb26`, hash `ae7a5f98e2f4785022a58890db980cb71bb9f0c1bd02a44a1d69699ad18baaaa`, drand round 28007049, drand randomness `8d59f6f2c17c6c3a77f65dfc4b5530bb607c8891d21a90cdff2628d69a461ca692b6ad3c041e1c7a8a9d87005cd6621d`. The decoded beacon reads as 47 characters; the message is 49. HMAC = `d6b318ab366262e3139f86c6d1f6695b548ee0e56c05128f5ba0b8ae1b71b3b1`, prefix `d6b318ab` = 3602061483, and 3602061483 % 48 = 27: Dark Blue (2×). The bet was on Dark Blue (`coin: "two"`), so `isWin: true` and the payout is $0.01 × 2 = $0.02. `SHA-256(hex_decode(serverSeed))` equals the committed hash.

### Reduction bias

2³² = 4,294,967,296 = 48 × 89,478,485 + 16. Positions 0–15 each carry 89,478,486 uint32 values and positions 16–47 carry 89,478,485. The per-position absolute bias is 1.552e-10 (1.118e-8 relative), at or under the 2⁻³² ceiling of 2.33 × 10⁻¹⁰; the per-tier EV effect is +7.451e-9 on Green, Red, Purple and Blue, 0 on Grey and −3.725e-9 on Dark Blue. Step 5 computes the bound and fails above 2⁻³²; Step 13 prints the per-tier expectations. The bias is disclosed as DL-2.

### Player-verifier parity

Duel's Castle Roulette Verify-tab code (E09) was pasted by Paulo from the duel.com Verify tab on 26 September 2026 and saved verbatim. Step 5 and the unit tests execute it, with only its two input values filled in, on two fixed vectors and all 1,350 rounds: 1,350/1,350 positions agree with the served position and `src/rng.ts` (CASTLE-09). `src/rng.ts`, ported from Duel's published verification code, cites 8 of this file's lines, each checked verbatim. This does not establish that the live Verify button or Duel's server runs exactly this code.

The ProvablyFair.org docs-site Castle Roulette verifier (`VerifyBets/games/castle-roulette/derive.js` + `lib/hmac-sha256.js`, mikepforg/pf-audit-duel `origin/main` @ `bd4d59c`) is vendored under [verifier-parity/](verifier-parity/) and pinned in `src/site-verifier.ts` (derive.js `44f821b59effc345e909cffae5f9c7fd50d1084a348d5e513322fefe0f55e98e`, hmac-sha256.js `bc30bfe9ef202905ece93de33440d41851abf16e910f90c2a567774a2b79d889`). Step 5 executes it on all 1,350 rounds with 0 disagreements. The live page (www.provablyfair.org/verify-bets) is a separate build and is not checked.

## Payouts and RTP

### Settlement rule

A bet wins when the recomputed position's tier equals `request.coin`; a win credits `amountWon = request.amount × multiplier`, a loss credits 0. Multipliers are stored with 18-decimal precision (for example `"2.000000000000000000"`); all 1,350 rounds carry exact integer multipliers. Steps 7 and 8 verify all 1,350 payouts, the capture-recorded `isWin` flags and the served multipliers against the table, with 0 mismatches; Step 9 holds every win's served credit to stake × table multiplier exactly at 18 dp. Phase C's 100 rounds at $1.00 recompute and settle exactly like the $0.01 rounds (Step 6); stake is not an input to the position.

### Baseline RTP by construction

For every tier, `count × multiplier = 48`, so `P(colour) × multiplier = 1.000` and the **baseline RTP is 100.0000%** for any colour selection. Step 13 derives this from the position counts alone, not from any casino-supplied probability table: all six tiers give `P × multiplier = 1.0` within the derived RANGE/2³² = 1.1176e-8 bound (largest departure 7.45e-9), the 48 position probabilities sum to 1.0 within 1e-10, and a negative control (each multiplier + 1) is rejected on every tier.

### House edge regimes: the settlement formula

Per Duel.com engineering disclosure, Castle Roulette's effective house edge is computed at settlement, not inside the outcome, and the operator applies a deterministic formula with a dual-cap **Zero Edge allowance**: up to **$50,000 of cumulative wager per 24-hour period** per player, with a per-bet cap of **$1,000** counted against the daily total.

```text
allowance      = min(1000, remaining_daily_allowance)          // the Zero Edge allowance for this bet
excess         = max(0, bet − allowance)                        // the allowance comes off the stake first
raw_edge       = excess × (multiplier − 1) / bankroll × 100     // percent
effective_edge = 0                                     if excess = 0
               = clamp(raw_edge, min_edge, max_edge)   otherwise // 0.1% to 5%, applied last
```

This is the order in Duel's client code (below): the allowance is subtracted from the stake, the bankroll formula is applied to what is left, and the 0.1% floor and 5% ceiling are applied last. Where neither limit binds, `excess × (multiplier − 1) / bankroll` equals the edge on the whole bet × (1 − allowance / bet), so the order matters only where the floor or the ceiling binds; at a $25,000 stake that is the 2× tile, where the client code gives 0.1%. In the client code a bet the remaining allowance covers (`allowance ≥ bet`) has zero edge, and Zero Edge covers castle roulette: the code takes its Zero Edge switch from the player's Zero Edge status for roulette bets. The captured wins show zero edge at $0.01 and $1.00 (Step 9). Once the $50,000 daily allowance is used up, the client code computes the edge on the full stake, capped at 5%; where that edge is below the 0.1% floor it returns 0 while the Zero Edge switch is on and 0.1% while it is off, as the code is written. That case was not observed in play.

**Duel's client code (a cited reading, not pinned).** The per-tile edge the UI displays is computed in `useRouletteScalingEdge-aDyPphv5.js` (1,799 bytes), which duel.com's `index-C0-aqrfD.js` loads. It was read on 5 October 2026 in a logged-in browser session, and the function below is reconstructed from the minified source with its operators restored (`Big` is the decimal library the file uses):

```js
function p({betAmountUsd:e, multiplier:n, limit:r, isZeroEdgeEnabled:i, bankroll:a, minEdgeLimit:o, maxEdgeLimit:s}) {
  if (e <= 0) return 0;
  let c = i && r > 0 ? Math.max(0, e - r) : e;                 // the allowance comes off the stake first
  if (c <= 0) return 0;                                         // the allowance covers the stake: edge 0
  let l = Big(c).mul(n).minus(c).div(a).mul(100).toNumber();    // edge % = (c × multiplier − c) / bankroll × 100
  return l < o ? (i && r <= 0 ? 0 : Big(o).div(100).toNumber()) // below the floor: the floor, or 0 when Zero Edge is on and limit ≤ 0
       : l > s ? Big(s).div(100).toNumber()                     // above the ceiling: the ceiling
       : Big(l).div(100).round(5).toNumber();
}
```

Its inputs, as read: `isZeroEdgeEnabled` is `zeroEdgeStatus.games[ROULETTE_BETS].enabled`; when the roulette scaling edge is enabled, `limit` is the smaller of `betLimit` and `zeroEdgeStatus.daily_wager_remaining`; `betAmountUsd` for a tile is the player's confirmed bets on that tile plus the bet being placed; the defaults `bankroll` 5e7, `minEdgeLimit` 0.1 and `maxEdgeLimit` 5 are overridden by the live roulette config and equal the three values in E10. The function returns a fraction (0.001 is 0.1%). The reading does not give the values of `betLimit` or of the daily total; the $1,000 and $50,000 in the formula are Duel's stated figures. This is client code as served on 5 October 2026, which computes the edge the UI displays; Duel's server settlement was not observed, and this audit does not claim that the server computes the edge the same way. The file is not pinned: no copy of it is in this repository and no SHA-256 of it was recorded, so the reading cannot be re-checked against those bytes, and Duel can replace the file at any time.

Per Duel's disclosure, the edge is applied at settlement by multiplier reduction, distinct from the asynchronous rakeback used by other Duel originals (Plinko, Keno, Dice, Mines, Beef, Blackjack, Video Poker). The disclosure phrased it as "no rakeback on this, just multi changes".

| Parameter | Value | Source |
|---|---|---|
| `bankroll` | 50,000,000 | `https://duel.com/api/v2/metadata/roulette` (`castle_roulette_config.bankroll`; E10, fetched 5 October 2026) |
| `min_house_edge_limit` | 0.1% | `/api/v2/metadata/roulette` (`castle_roulette_config.min_house_edge_limit`; E10, fetched 5 October 2026) |
| `max_house_edge_limit` | 5.0% | `/api/v2/metadata/roulette` (`castle_roulette_config.max_house_edge_limit`; E10, fetched 5 October 2026) |
| `exposure_percent` | 5 | `/api/v2/metadata/roulette` (`castle_roulette_config.exposure_percent`; E10, fetched 5 October 2026) |
| Daily Zero Edge allowance | $50,000 per 24h | Operator disclosure (verbal); reflected live in the UI; **not in the metadata payload** (none of the 18 `castle_roulette_config` fields in E10) |
| Per-bet Zero Edge allowance | $1,000 | Operator disclosure (verbal); reflected live in the UI; **not in the metadata payload** (none of the 18 `castle_roulette_config` fields in E10) |

The four metadata values are those in E10: the response to `GET https://duel.com/api/v2/metadata/roulette` in the duel.com config as fetched 2026-10-05 in a logged-in session (read-only GET), at 12:16:41 UTC. E10 is that response body with four streaming-vendor values and the live host's personal data replaced by `"REDACTED"` (listed in the evidence register); the four parameters and every other byte are as served. The payload serves them as strings (`"50000000"`, `"0.1"`, `"5"`, `"5"`); the formula uses the bankroll and the two edge limits, not `exposure_percent`. The same four values are in a copy of the payload dated 21 March 2026 (annotated, so not in the evidence register), and Duel gave the same bankroll and limits on 21 May 2026. E10 records the values as fetched on 5 October 2026, not on the capture days (22–23 April 2026) or when the live-UI screenshot below was taken; they can change at any time (see admin-tunable settlement parameters).

**Check against the live UI.** For a candidate $25,000 stake with the full daily allowance remaining, `allowance = min(1000, 50000) = 1000`, which comes off the stake first and leaves `excess = 24,000`. On the 48× tile, `raw_edge = 24000 × 47 / 50,000,000 × 100 = 2.256%`, inside the limits, so `effective_edge = 2.256%`.

| Tile | `raw_edge` on $24,000 | `effective_edge` | UI displays |
|---|---|---|---|
| 2×   | 0.048%     | 0.1% (floor) | no figure shown |
| 4×   | 0.144%     | 0.144%       | 0.144% |
| 8×   | 0.336%     | 0.336%       | 0.336% |
| 16×  | 0.72%      | 0.72%        | 0.72%  |
| 24×  | 1.104%     | 1.104%       | 1.104% |
| 48×  | 2.256%     | 2.256%       | 2.256% |

In a screenshot of the live UI at a $25,000 stake, received on 22 May 2026, the 4× to 48× tiles show the five values above and the 2× tile shows no house-edge figure. 2× is the tile where the floor binds: the edge on the $24,000 the allowance leaves is 0.048%, which the client code lifts to the 0.1% floor, so it computes 0.1% there. Why the 2× tile showed no figure is not established: the part of the client code that displays the figure was not read. The screenshot is not in the evidence register, and when it was taken is not recorded. On the five tiles that show a figure, the formula reproduces the UI from the bankroll and edge limits in E10 plus the two operator-stated allowance ceilings. E10 is the duel.com config as fetched 2026-10-05 in a logged-in session (read-only GET), not taken in the same session as the screenshot; its bankroll and edge limits are the ones Duel gave on 21 May 2026.

**At the captured stakes.** In Duel's client code, for any bet ≤ $1,000 while at least that much of the daily allowance remains, `allowance ≥ bet`, so `excess` is 0 and the effective edge is 0. All 1,350 captured rounds (max single bet $1.00) are in this region. Step 9 derives the settlement edge from the served credits: on all 473 winning rounds (432 at $0.01, 41 at $1.00) the credit Duel's transactions API served equals the served stake × the table multiplier exactly at 18 dp, a settlement edge of 0. The dataset's `effectiveEdge` field is the capture script's literal 0 and is not scored. Stakes above $1.00 were not exercised; above the floor, the formula's predictions match the UI on the five tiles that show a figure.

### Simulation

**Pass 1** simulates 5,000,000 rounds in 10 independent streams of 500,000, from seed pairs pinned in [src/sim-seeds.ts](src/sim-seeds.ts), through the same HMAC-SHA256 + `% 48` formula. Per-stream chi-squared tests on 48 positions are combined by Fisher's method, `T = −2 Σ ln(p_i) ~ χ²(2K)`: T = 15.09, df = 20, p = 0.7712, 0/10 streams below α = 0.01. Serial independence on the combined sequence: lag-1 z = −2.384 (|z| < 3), runs p = 0.4312 (≥ 0.01), 0 serial-independence failures. Simulated RTP 100.0070%. Since 26 September 2026 the verifier replays all 10 streams, the full 5,000,000-position sequence, on every run and recomputes the lag-1 correlation, runs test and convergence series from it.

**Pass 2** tests the 1,350 casino server seeds: each is paired with 1,000 drand values (1,350,000 simulated rounds) and a chi-squared test is run on its 48-position distribution. 15 seeds fail at α = 0.01 against 13.5 expected under H₀ and a failure threshold of 25. Mean casino-seed RTP 99.9985%. The verifier replays Pass 2 in full.

| Source | RTP | Role |
|---|---|---|
| Analytical (Step 13) | 100.0000% | Mathematical proof of the baseline |
| Simulation Pass 1 (5M rounds) | 100.0070% | Confirms the implementation |
| Simulation Pass 2 (1.35M rounds, casino seeds) | 99.9985% | Seed-selection screen |
| Live capture (1,350 rounds) | 83.77% | Informational; underpowered, high variance |

All figures in this table describe the baseline RTP, before the settlement-stage edge.

### Captured returns

| Colour bet | Rounds | Wins | Win rate | Expected | Observed RTP |
|---|---:|---:|---:|---:|---:|
| 2× (Dark Blue) | 934 | 449 | 48.1% | 50.0% | 83.2% |
| 4× (Grey) | 34 | 8 | 23.5% | 25.0% | 94.1% |
| 8× (Blue) | 33 | 4 | 12.1% | 12.5% | 97.0% |
| 16× (Purple) | 133 | 5 | 3.8% | 6.3% | 60.2% |
| 24× (Red) | 33 | 3 | 9.1% | 4.2% | 218.2% |
| 48× (Green) | 183 | 4 | 2.2% | 2.1% | 104.9% |

Overall observed RTP 83.77% on $112.50 wagered. Landed positions by colour against expectation: Green 33 (28.1 expected), Red 65 (56.3), Purple 83 (84.4), Blue 195 (168.8), Grey 315 (337.5), Dark Blue 659 (675.0). The 48-bin chi-squared gives χ² = 36.52, df = 47, p = 0.8650. Green's 33 hits against 28.125 expected give z = 0.93. These live figures are informational context; the 5,000,000-round simulation is the authoritative distribution test.

### RTP claim table

[outputs/rtp-claim-table.json](outputs/rtp-claim-table.json) tables the exact RTP of the six colour tiers: true minimum 100.000000%, true maximum 100.000001%. Under the RTP-CLAIM rule 1.2.0 (Methodology v1.1, switched on by decision D3) the claim is **kind `noted`**: the figure it used to hold the tiers to, a flat 100% (zero settlement edge: served credit = stake × table multiplier on all 473 winning rounds, Step 9), is Duel's Zero Edge allowance (no settlement edge on up to $1,000 of a bet, within $50,000 of wager per 24 hours), not a figure Duel's game settings state, and decision D3 records zero-edge lines as noted, not tested. The game settings (E10) state the settlement edge beyond the allowance, a 0.1% floor (`min_house_edge_limit`) and a 5% ceiling (`max_house_edge_limit`), computed per stake by Duel's client code; no captured stake reached it (DL-5), and this table does not model it. Outcome: NOTED, status INFO whether or not the rule is enforced, so it moves no step and no verdict; a committed table that differs from the run, or from its pin, still exits 1. [src/rtp-settings.ts](src/rtp-settings.ts) generates it and pins its SHA-256.

## Verification results

The audit evaluates the **1,350 rounds captured on 22–23 April 2026**. Its 19 scored steps report **19 PASS, 0 flags and 0 hard failures**. Each step carries the ProvablyFair.org Castle Roulette profile check(s) it implements (`src/profile-map.ts`, emitted as `profileIds` in `outputs/verification-results.json`); the profile is **1.0.2** (approved as cited, Methodology v1.1 decision D6, 14 October 2026).

| Step | Check | Result and scope |
|---:|---|---|
| 1 | Seed hash integrity | PASS: all 1,350 commitments required by `src/loader.ts` opened and verified; 0 rounds left unopened |
| 2 | Bet before drand beacon | PASS: every bet accepted strictly before its beacon was published, each margin anchored to a server-side `transactions-api` timestamp, and the capture's stored margin equal to the recomputation; min 14.763 s, mean 20.067 s, max 20.405 s |
| 3 | drand round monotonicity | PASS: all 1,349 consecutive transitions strictly increasing: no beacon round reused or out of order. Ordering only; advance beacon selection (the server choosing which later beacon a round uses) was not verified |
| 4 | Server seed uniqueness | PASS: 1,350 distinct seeds and 1,350 distinct commitment hashes, matching the declared population |
| 5 | Position recomputation | PASS: 1,350/1,350 positions recomputed; draw bias 1.552e-10 per position, at or under 2⁻³² (largest tier EV effect 7.451e-9); the docs-site verifier and Duel's Verify-tab code each reproduce all 1,350 |
| 6 | Bet-size invariance | PASS: 100/100 Phase C ($1) positions recompute identically |
| 7 | Payout math | PASS: 1,350/1,350 payouts correct; 1,350/1,350 capture-recorded `isWin` flags agree with the tier |
| 8 | Colour-position mapping | PASS: 1,350/1,350 recomputed positions map to the served tier; served multiplier equals the table exactly |
| 9 | Settlement edge verification | PASS: 473/473 winning rounds (on the recomputed tier) credited stake × table multiplier exactly at 18 dp, from the served `amountWon` and `amountCurrency`; settlement edge 0 at both captured stakes ($0.01 and $1.00) |
| 10 | Phase coverage | PASS: A 800, B 200, C 100, D 100, E 150, as declared in `src/loader.ts` |
| 11 | Dataset hash | PASS: SHA-256 matches the pin; a mismatch is scored here as a FAIL |
| 12 | drand chain formula | PASS: all 1,350 `drandPublishedAt` values equal genesis + (round − 1) × 3 s |
| 13 | Anti-circularity (baseline RTP) | PASS: all 6 tiers `P × multiplier = 1.0` within 1.1176e-8; position probabilities sum to 1.0 within 1e-10; negative control rejected on every tier |
| 14 | Simulation Pass 1 | PASS: all 10 streams regenerated from `src/sim-seeds.ts` and every statistic recomputed; T = 15.09, p = 0.7712, lag-1 z = −2.384, simulated RTP 100.0070% |
| 15 | Simulation Pass 2 | PASS: replayed in full; 15 chi-squared failures against a threshold of 25; limited detection power (DL-6) |
| 16 | drand API signature verification | PASS: 1,350/1,350 rows recounted and bound to the dataset; signatures equal drand.cloudflare.com's by string comparison, not BLS verification |
| 17 | Configuration coverage | PASS: all 6 tiers above the 30-round floor (two 934, four 34, eight 33, sixteen 133, twenty_four 33, forty_eight 183); 48 of 48 positions landed on |
| 18 | Artifact integrity | PASS: 3 artifacts match their SHA-256 pins in `src/artifact-pins.ts`; all 3,268 numeric leaves of the two JSON artifacts lie in their declared domains (`src/domains.ts`) |
| 19 | Live-sample fit (informational, flag-only) | PASS: positions fit the 48-position wheel (χ² df 47, p = 0.865); each tier's win rate fits the binomial (smallest p = 0.252); 7 tests at Bonferroni 0.01/7 |

**Timing.** The margin `commitmentBeforeDrand = drandPublishedAt × 1000 − betPlacedAt` was positive on all 1,350 rounds. `betPlacedAt` is `timestamp_raw` from the operator's transactions API, matched by drand round id and the colour bet; `drandPublishedAt` is computed from the public chain constants, so a third party can recompute both; no local clock is used. A single negative margin would fail Step 2 for the whole audit. The mean and maximum cluster near 20 seconds, consistent with the game's round cycle. The margin times the bet, not the moment the seed hash was shown, and the bet time is the operator's own clock (P5, P6, DL-3).

S5: fairness-integrity matrix; game-integrity testing not commissioned.

**Framework attack coverage.** The standardized matrix was restated on 26 September 2026 from the package's own ten categories. Castle Roulette has a per-round server seed and a public drand beacon, and no client seed, nonce sequence or seed rotation, so three framework rows are not applicable.

<!-- S5-MATRIX:START -->
| Test | Category | Attack | Expected fair behaviour | Result | Decided by |
|------|----------|--------|-------------------------|--------|------------|
| S5-1 | Seed substitution | Settle a round under a server seed other than the one committed | Every revealed seed hashes to its commitment; one fresh seed per round | Pass | Steps 1, 4, 11 — 1,350/1,350 commitments opened, 1,350 distinct seeds and hashes, dataset pinned; the match is against the commitment stored in the round's result record, a consistency check (no timed pre-round observation of the commitment was preserved, DL-3) |
| S5-2 | Client-seed manipulation | Neutralise the player's entropy | — | Not applicable — no client seed; the unpredictable input is the public drand beacon | Steps 2, 16 — every bet accepted before its beacon round was published; 1,350/1,350 beacon values equal the public chain's |
| S5-3 | Stake-conditional outcome | Make the position depend on the wager | $1 rounds recompute exactly like $0.01 rounds | Pass | Step 6 — 100/100 Phase C rounds; the RNG takes no stake input |
| S5-4 | Server-seed cherry-picking | Choose a server seed after seeing the beacon, or select seeds by outcome | Seed fixed before the beacon; no per-seed distribution bias | Select seeds by outcome: Pass (limited power). Seed chosen after the beacon: not established by this capture (P6, DL-3) | Step 15 — 1,350 seeds × 1,000 beacon values replayed, 15 chi-squared failures against a threshold of 25; it pairs each seed with synthetic beacon values, not its own beacon, so it cannot see a seed chosen for its own beacon. Step 2 times the bet, not the seed, and no timed pre-round observation of the hash was preserved, so the seed-before-beacon ordering is premise P6 (ASSUMED, DL-3) |
| S5-5 | Seed-rotation race (TOCTOU) | Rotate the seed between commitment and settlement | — | Not applicable — no seed rotation; each round carries its own seed | Step 4 — 1,350 distinct seeds |
| S5-6 | Multiplier tampering | Credit a multiplier other than the table's | Served multiplier = table value at the recomputed position; credit = stake × multiplier | Pass | Steps 7, 8 — exact on every round |
| S5-7 | Nonce manipulation | Replay or reorder draws | — | Not applicable — the nonce is fixed at 0; ordering is the beacon's | Step 3 — drand round ids strictly increasing |
| S5-8 | Range-mapping bias | Map the HMAC output to positions with a biased reduction | Per-position bias at or under 2^-32 | Pass (plain `% 48`, bias 1.552e-10 per position — disclosed, MANIFEST DL-2) | Step 5 (computed bound), Step 13 (per-tier EV), Step 14 (5,000,000 simulated rounds) |
<!-- S5-MATRIX:END -->

The package's original ten categories remain as supplementary rows:

| ID | Category | Result | Basis |
|---|---|---|---|
| S1 | Outcome prediction | Pass | The position needs the committed seed and a beacon published later; predicting it would require breaking SHA-256 preimage resistance or predicting the BLS threshold signature |
| S2 | Post-bet manipulation | Pass | Every revealed seed hashes to the commitment stored with its result (Step 1), a consistency check that does not time the commitment; the beacon is produced by an external threshold network and was published after every bet on the operator's transactions-API clock: 1,350 positive margins (min 14.763 s, Step 2). That the seed was fixed before the beacon is premise P6 (DL-3); which later beacon a round uses was not verified (Step 3) |
| S3 | Seed lifecycle | Pass | No rotation epochs or `nextServerSeedHash` chain; 1,350 unique seeds |
| S4 | Nonce reuse | N/A | No nonces; replay would need a reused seed, i.e. a SHA-256 collision |
| S5 | RNG bias | Pass | Fisher's T = 15.09, df = 20, p = 0.7712 over 5,000,000 simulated rounds |
| S6 | Cross-bet correlation | Pass | lag-1 z = −2.384 (\|z\| < 3), runs p = 0.4312 |
| S7 | Timing attacks | Pass | Knowing when a beacon publishes does not reveal its content; all margins positive |
| S8 | Session manipulation | Pass | The formula takes only `serverSeed` and `drandSignature`; all 1,350 rounds recompute from those alone |
| S9 | Bet-size dependence | Pass | 100/100 Phase C ($1) rounds recompute identically |
| S10 | Account-dependent outcome | Not tested | Single account; whether different accounts receive different commitments for the same round needs two funded accounts (R-MULTI) |

These checks are offline analysis and replay of the captured rounds, not attempted manipulation of the live API.

## Reproduce the audit

Use **Node.js 22.x**, pinned by `.nvmrc` and the `engines` field of `package.json` (the committed artifacts were produced on that line), and npm ≥ 9. Run from the package directory:

```sh
npm ci
npm test
```

This runs **24 Mocha tests** (known-answer rounds, full-dataset recomputation, the payout table, statistics, and Duel's Verify-tab code executed with only its inputs filled in), then the 19-step verifier, offline, against the committed artifacts. Expected summary: `Passed: 19/19`, `VERDICT: PROVABLY FAIR — Full Pass`, `Reproduction vs the committed artifact on Node 22.x.y: REPRODUCED`, exit 0.

| Command | Purpose |
|---|---|
| `npx mocha` | Unit tests only |
| `npm run verify` | The 19 scored steps, informational items and the reproduction gate |
| `npm run simulate` | Regenerate Pass 1 and Pass 2 into `outputs/run/` |
| `npm run test:full` | Unit tests → simulation → verification |
| `npm run timing` | Network: re-check the chain formula and margins, and re-fetch every signature from drand.cloudflare.com |
| `npm run mutate` | Run the mutation battery in a disposable copy |

**The gate.** Neither `npm run verify` nor `npm run simulate` writes into `outputs/`. A run's results, simulation products and `diff.json` go to `outputs/run/` (gitignored, a run record rather than evidence), so a re-run cannot replace the evidence it scores. `outputs/run/diff.json` compares the run against the committed `outputs/verification-results.json` field by field and records the runtime. Tolerance is **1e-14 absolute + 1e-12 relative**, and two distinct integers never agree; a last-place change in a derived statistic is recorded as `withinTolerance` and not scored. The SHA-256 dataset guard is never rewritten to make a run agree.

| Exit | Meaning |
|---:|---|
| 0 | `PROVABLY FAIR — Full Pass`, and this run reproduces the committed artifact |
| 1 | At least one hard fail, or a reproduction difference beyond tolerance |
| 2 | At least one FLAG — `PROVABLY FAIR — Conditional Pass` |
| 5 | `RTP FIGURE OVERSTATED`: no draw check failed, but the RTP-CLAIM rule (1.2.0, switched on) found settings beyond the 0.1 pp band on the house side of the published figure. It outranks a Conditional Pass; a hard fail (exit 1) outranks it |

**Artifacts of record.** Pinned by SHA-256 in `src/artifact-pins.ts` and checked by Step 18:

| Artifact | Producer |
|---|---|
| `outputs/drand-api-verification.json` | `npm run timing` (network) |
| `outputs/simulation-results.json` | `PF_EMIT=1 npm run simulate` |
| `outputs/rtp-convergence.html` | `PF_EMIT=1 npm run simulate` |

`outputs/verification-results.json` is the verifier's own output and is guarded by the reproduction gate instead; it is refreshed only by `PF_EMIT=1 npm run verify`. `outputs/rtp-claim-table.json` is pinned in `src/rtp-settings.ts`. The simulation is deterministic (HMAC-SHA256 streams from a fixed master seed), and `simulation-results.json` carries no run timestamp, so a no-change regeneration reproduces the pinned bytes. The drand fetch time, 2026-04-23T12:43:14.168Z, was removed from the pinned file on 26 September 2026 as run metadata.

**Deliberate refresh only.** `PF_EMIT=1 npm run simulate` and `PF_EMIT=1 npm run verify` overwrite committed outputs; a regenerated artifact must be re-pinned in `src/artifact-pins.ts` in the same change. To refresh the RTP claim table after a reviewed change:

```sh
npm run rtp-claim:write
# update RTP_CLAIM_TABLE_SHA256 in src/rtp-settings.ts with the printed digest
npm run verify
npm run release-manifest
node scripts/release-manifest.mjs --check
```

The release generator requires both README.md and MANIFEST.md and checks that each carries the audit ID.

**Mutation battery.** `npm run mutate` runs the 31 step-named mutations in `tests/mutations.json` in a disposable copy. Measured 4 October 2026, each entry through its own `--only` selector with the baseline green in each copy: 31/31 killed, 19/19 scored steps covered. Rerun on 14 October 2026 as one serial `npm run mutate` on the tree carrying RTP-CLAIM 1.2.0 switched on (baseline verify and mocha exit 0): 31/31 killed, 19/19 scored steps covered. M09 forges a win credited at a 0.1% settlement edge and is killed by Step 9. M05e–M05i forge the operator file and re-pin it, edit it without re-pin, edit the runner without re-pin, forge the runner and re-pin it, and move a citation. Second pass, 14–15 October 2026 (FIXPASS2 class C3; no exit-5 entry here, the claim is noted): see the release-history entry "14 October 2026 (second pass)"; the release manifest records that run.

**Fresh-clone reproduction (measured 19 October 2026, on the current 24-test, 19-step suite):**

| Run | Tree | Node | Result |
|---|---|---|---|
| `git clone` of the working copy → `npm ci` → `npm test` | main @ `25d40ba` (before the 19 October wording edits, which change no code path) | v22.23.1 | npm ci exit 0 in 1.38 s (npm 10.9.8); npm test exit 0 in 81.75 s — 24 passing, 19/19, Full Pass, REPRODUCED; `outputs/run/verification-results.json` byte-identical to the committed file |
| same clone → `npm run test:full` | as above | v22.23.1 | exit 0 in 114.35 s — 24 passing, 19/19, Full Pass, REPRODUCED; regenerated `simulation-results.json` and `rtp-convergence.html` byte-identical to the pinned files; the clone's tracked files unchanged afterwards |

Machine: Apple M2 Max, 12 cores, shared with other runs (load average 88.86 when the runs ended), so the wall times reflect that load. The table it replaces was measured on 26 September 2026 on the earlier 18-step, 20-test suite (`npm run test:full` exit 0 in 47 s).

Verify the dataset identity independently:

```sh
shasum -a 256 data/castle-roulette-master-1350rounds.json
```

Expected: `506e05ee9c07966a721715cd7d7b369e72159601b6a6439542330b311ffd66ce`.

## Verify a bet

An ordered path a player can follow to check one Castle Roulette round. Field names are the dataset's names for the values Duel serves, the ones `declarations/duel.castle-roulette.json` (Framework 1.1) records: the round under `result.*`, the bet under `request.*`. Nothing below reads an operator odds or win-chance field.

1. **Save the commitment before you bet, then find the revealed values.** Every round has its own server seed. Before you bet, copy and save the round's server seed hash ("Server Seed Hashed") as it is shown for that round before betting; the server broadcasts it when the round opens (`rolling`, above). After the round spins, its **Provably Fair** panel (E06, illustrative: Round ID, Server Seed Hashed, Server Seed, Drand Round ID, Drand Randomness, a Verify button) shows both the commitment and the plaintext. The drand value can also be fetched from any drand relay by its round number.
2. **Collect the fields.** `result.serverSeed` (64 hex characters, "Server Seed"), `result.serverSeedHash` ("Server Seed Hashed"), `result.drandRoundId` ("Drand Round ID"), `result.drandRandomness` (96 hex characters, "Drand Randomness"), `request.coin`, and the served `result.position`, `result.winningCoin`, `result.multiplier`, `result.amountWon` with your stake `request.amount`.
3. **Check the commitment encoding against your saved value.** The seed is hashed as **bytes**, not as its hex string: `SHA-256(hex_decode(result.serverSeed))` must equal the hash you saved before betting, and `result.serverSeedHash` must equal it too. A PASS here means hash equality: the revealed seed is consistent with that hash. It does not show when the hash was first shown, because a seed and hash pair made after the round would also match each other; the assurance that the commitment came before your bet comes from your own record saved before betting.
4. **Check the beacon and its timing.** `result.drandRandomness` must be the published quicknet signature for `result.drandRoundId` (chain `52db9ba7…`; this audit matched all 1,350, Step 16), published at `1692803367 + (drandRoundId − 1) × 3` seconds, after your bet (Step 2). For the message the signature is hex-decoded to bytes and those bytes read as UTF-8 (`src/rng.ts` uses Node.js `Buffer.toString('utf-8')`; the site verifier's decoding gives the same position on all 1,350 rounds).
5. **Reduce to a position.** `digest = HMAC-SHA256(key = hex_decode(result.serverSeed), message = UTF8(hex_decode(result.drandRandomness)) + ":0")`, then `position = parseInt(digest[0..7], 16) % 48`, with no rejection. The result must equal `result.position` (0–47).
6. **Map the position to its tier.** Positions are numbered **from 0**: 0 `forty_eight` (Green, 48×); 1–2 `twenty_four` (Red, 24×); 3–5 `sixteen` (Purple, 16×); 6–11 `eight` (Blue, 8×); 12–23 `four` (Grey, 4×); 24–47 `two` (Dark Blue, 2×). `result.winningCoin` must be your position's tier; your bet wins exactly when it equals your `request.coin`; a win credits `result.amountWon = request.amount × multiplier`, a loss credits 0.

If all six checks hold, the revealed seed is consistent with the hash you saved before betting, the beacon is the published quicknet value for its round, and the position, tier and credit follow the published table. That the seed was committed before your bet rests on the hash you saved before betting, not on the hash match itself. The audit runs this path on all 1,350 captured rounds (Steps 1, 2, 5, 7, 8, 12, 16); for those rounds the hash match is a consistency check only, since the capture did not preserve a timed pre-round observation of each round's commitment (DL-3), and the bet-before-beacon ordering rests on the bet timestamps recorded from the operator's transactions API against the beacon publication times (Step 2), with capture integrity assumed (P1, P5, P6). A matching round does not by itself establish when its commitment was first shown, or the settlement edge at stakes above $1.00, where no bet was placed.

## Evidence

The primary evidence is the 1,350-round capture of 22–23 April 2026 with its revealed seeds, beacon values and transactions-API timestamps. Screenshots illustrate interface states; they do not replace the recorded responses or establish current live behaviour. The exhibit numbers below are the package's register; the screenshot file names carry an older numbering.

| ID | File | Evidence and role |
|---|---|---|
| E01 | [outputs/verification-results.json](outputs/verification-results.json) | All 19 scored step results with informational items and the verdict; compared field by field with each fresh run |
| E02 | [outputs/simulation-results.json](outputs/simulation-results.json) | Pass 1: 5M rounds, T = 15.09 (p = 0.7712), lag-1 z = −2.384, runs p = 0.4312, simulated RTP 100.0070%; Pass 2: 1,350 seeds × 1,000 drand values, 15 chi-squared failures, mean RTP 99.9985%; pinned |
| E03 | [outputs/rtp-convergence.html](outputs/rtp-convergence.html) | Self-contained chart of RTP convergence across increasing round counts; Chart.js inlined; pinned |
| E04 | [outputs/drand-api-verification.json](outputs/drand-api-verification.json) | 1,350/1,350 drand signatures matched byte for byte against drand.cloudflare.com (quicknet), 0 failures; pinned |
| E05 | [evidence/E01-castle-roulette-game-ui.png](evidence/E01-castle-roulette-game-ui.png) | Game UI: wheel, bet controls, the six colour tiers |
| E06 | [evidence/E02-provably-fair-panel.png](evidence/E02-provably-fair-panel.png) | Provably Fair panel: server seed hash, revealed server seed, drand metadata. Illustrative only: it shows round 538305 after it settled, with the seed and its hash revealed together; that round is not in the dataset and no bet on it is recorded, so the screenshot is not pre-bet evidence for any recorded round |
| E07 | [evidence/E03-fairness-page-overview.png](evidence/E03-fairness-page-overview.png) | Duel.com fairness page overview |
| E08 | [evidence/E04-fairness-verify-page.png](evidence/E04-fairness-verify-page.png) | Fairness verification page: game selector, seed input fields, published code |
| E09 | [evidence/verify-tab/duel-verify-tab-castle-roulette-2026-09-26.js](evidence/verify-tab/duel-verify-tab-castle-roulette-2026-09-26.js) | Duel's own Castle Roulette verification code, pasted by Paulo from the duel.com Verify tab on 26 September 2026 (Provably Fair → Verify, game Castle Roulette, code panel), saved verbatim and never edited. SHA-256 `c83dca216f2d79aee3f8d60fa663528a9b6298a157d0851450c0f31c5de92bc7`, 2,263 bytes, 72 lines. Pinned with its runner (`verifier-parity/operator/run-operator-verifier.cjs`) in `src/operator-verifier.ts`; cited line by line by `src/rng.ts` (8 lines, checked verbatim); executed on all 1,350 rounds, 1,350/1,350 agreeing (CASTLE-09) |
| E10 | [evidence/E10-metadata-roulette-2026-10-05.json](evidence/E10-metadata-roulette-2026-10-05.json) | Duel's settlement parameters: the response body of `GET https://duel.com/api/v2/metadata/roulette` in the duel.com config as fetched 2026-10-05 in a logged-in session (read-only GET), at 12:16:41 UTC (HTTP 200), redacted. Four streaming-vendor values under `castle_roulette_config` are replaced by the string `"REDACTED"`: `dolby_subscriber_token` (a subscriber token), `dolby_account_id`, `dolby_media_storage` and `red5_stream_endpoint` (a stream URL whose host name carries a vendor user id). The live host's personal data under `hosts[0]` is replaced the same way: `user_id`, `user.avatar`, `user.display_name`, `user.username`, `user.original_username`, `tips_count` and `tips_sum_amount_coins`. Every other byte is as served. Redacted file: SHA-256 `1305633663bf378c9d2d05191ecb084c17f0fc1f8885b61c2a3b6765c47ab57c`, 33,975 bytes. The unredacted original (SHA-256 `fab1a620f45963b3fa1054bb7f6882d2eb8750114839c328ef8df207032ad2e3`, 34,190 bytes) is held privately by ProvablyFair.org and is not in this repository. `castle_roulette_config` carries `bankroll` `"50000000"`, `min_house_edge_limit` `"0.1"`, `max_house_edge_limit` `"5"` and `exposure_percent` `"5"` (the parameter table above; none of the four is redacted). Its request path, status, response headers and fetch time are in [evidence/E10-metadata-roulette-2026-10-05.json.meta.json](evidence/E10-metadata-roulette-2026-10-05.json.meta.json): the metadata file as captured (SHA-256 `0ef96a5cbfcc299b3615af879e554ee35bbfbeed6a13a91c0139fc14b5f75b63`, 4,811 bytes) with a `redaction` record added that lists the redacted keys and both body hashes; SHA-256 `18c652c76cd5f5bbc01f00434ed80c8ce2575f8ec9433653c630cbe119a55fd0`, 6,151 bytes. Checked on the original before committing: the payload holds `rolls` (100 rounds, each with its revealed server seed, hash, drand round, drand value and roll), `hosts` (one user record, `livestream_name` `"castle_roulette"`; its user id, usernames, display name, avatar URL and tip totals are redacted) and `castle_roulette_config` (18 fields: 12 stream settings, being 3 `red5_*`, 8 `dolby_*` and `fallback_iframe_url`; the four parameters; `payout_delays` `"4000"` and `min_host_tip` `"0.5"`). The 18 recorded response headers include no `Set-Cookie`. Not read by any step and not hashed by the release manifest |

E05 and E06 (1 October 2026): other players' usernames are masked with solid boxes: the live chat column (names and messages) and the player names under the six bet tiles. Every pixel outside the boxes is unchanged (compared pixel by pixel). No step reads or hashes an image.

| ID | SHA-256 as captured | SHA-256 masked |
|---|---|---|
| E05 | `4cd38926260eed93dd20bcd4d52da3bd5547a7f7de59f781b51da1e23a8d8288` | `43461c046ac2a23760f446fb3a7af2c25feb22acd7a64c4371667bcf0641aa07` |
| E06 | `4f413697c1ee02481d4ae3c53fceaa9f4d3a37c946a71f8ce96132a0b1106960` | `185cc678dc27242bd2711c282a556a5c4c31316441842286f6a2b13973ed6777` |

**Cited reading, not an exhibit.** Duel's client file `useRouletteScalingEdge-aDyPphv5.js` (1,799 bytes, as served on 5 October 2026), from which the order of the settlement formula is read, is quoted as a reconstructed function under [Payouts and RTP](#payouts-and-rtp). It is not pinned: no copy of it is in this repository and no SHA-256 of it was recorded. No step reads it.

### Source files supporting the result

| File | Role |
|---|---|
| `src/rng.ts` | HMAC-SHA256 position algorithm, position → colour mapping, multiplier table |
| `src/loader.ts` | Dataset loader, SHA-256 guard and the declared population (round, phase, seed and timing-source counts) |
| `src/artifact-pins.ts`, `src/domains.ts` | SHA-256 pins of the three artifacts of record; value domain of every numeric leaf (Step 18) |
| `src/diff.ts` | Field-level reproduction diff at tolerance |
| `src/stats.ts`, `src/simulate.ts`, `src/sim-seeds.ts` | Chi-squared, lag-1 autocorrelation and runs test; the two-pass simulation and its pinned seeds |
| `src/verify-drand-timing.js` | drand timing check and API signature fetch (`npm run timing`) |
| `src/site-verifier.ts`, `src/operator-verifier.ts` | Pins and runs the docs-site verifier and Duel's Verify-tab code (Step 5) |
| `src/rtp-settings.ts`, `src/profile-map.ts` | RTP claim table generator and pin; profile check per step |
| `tests/verify.ts`, `tests/steps/` | The 19-step orchestrator, informational items and reproduction gate; one module per step group |
| `tests/castle-roulette/CastleRouletteTests.ts` | The Mocha unit tests |
| `tests/mutations.json`, `scripts/mutate.mjs` | Mutation registry and runner |
| `capture/castle-roulette-capture.js` | The runnable capture script (bets, WebSocket recording, and the enrichment in `save()`, which writes the dataset's `meta.schema` and `meta.enrichment`); kept in ProvablyFair.org's working copy and not carried by the release, which ships the two reference records below in its place |
| `capture/castle-roulette-capture.reference.js` | Capture method of the browser-session WebSocket capture; reference record |
| `capture/castle-roulette-enrich.reference.js` | The enrichment step: which fields came from Duel's transactions API and how each round was matched; reference record |

## Limitations and trust

The **Full Pass** describes reproduction and consistency of the captured rounds under the published algorithm and wheel table. If the server seed was fixed before its beacon was published (premise P6, ASSUMED: no timed pre-round observation of the hash was preserved, DL-3), seed cherry-pick risk on the RNG is LOW: to choose a seed by outcome the operator would then have to predict a BLS threshold signature produced by the League of Entropy before it is published. This capture does not establish P6. Pass 2 found no seed-selection signal (15 failures against a threshold of 25), with limited power (DL-6). Neither covers which later beacon a round uses: increasing drand round IDs (Step 3) show ordering only, and advance beacon selection was not verified (residual operator trust below).

### Declared limitations register

| ID | Limitation | Magnitude (measured) | Where it is enforced or disclosed |
|----|------------|----------------------|-----------------------------------|
| DL-1 | One test account | Whether different players receive different seed commitments for the same round was not tested | R-MULTI below; S5 supplementary row S10 |
| DL-2 | The draw is a plain `uint32 % 48` with no rejection | positions 0–15 carry 89,478,486 of 2^32 values, positions 16–47 carry 89,478,485: 1.552e-10 per position absolute (1.118e-8 relative), at or under the 2^-32 ceiling; per-tier EV effect +7.451e-9 on Green, Red, Purple and Blue, 0 on Grey, −3.725e-9 on Dark Blue | Step 5 computes the bound and FAILs above 2^-32; Step 13 prints the per-tier expectations |
| DL-3 | The server-seed commitment is not preserved as a timed pre-round observation | 1,350 of 1,350 rounds carry `serverSeedHash` only in the result record, with no receipt time. The capture script read it from the `rolling` message when present (capture reference line 197), otherwise from `roll` or `end` (lines 218, 234), and the enrichment step overwrote it with the transaction's value where the transaction carried one (enrich reference line 101); the dataset does not record which source a round's hash came from | "The seed was fixed before the beacon" is premise P6 (ASSUMED); Step 2 times the bet against the beacon on the operator's clock (P5), not the seed; the hash match in Step 1 is a consistency check and does not time the commitment. The panel screenshot E06 is illustrative only: it shows a settled round (538305, which is not in the dataset, so no bet on it is recorded) with the seed and its hash revealed together, so it does not show when the hash was first displayed. A capture-origin gap, not an operator finding |
| DL-4 | drand values are matched by string equality, not BLS-verified | 1,350/1,350 signatures equal the value drand.cloudflare.com returned for the round, fetched 2026-04-23T12:43:14.168Z (the fetch time, removed from the pinned file on 26 Sep 2026 as run metadata) | Step 16 |
| DL-5 | Settlement-stage edge observed only at the captured stakes ($0.01 and $1.00), below the Zero Edge cap | full multiplier credited on all 473 winning rounds (stakes $0.01 and $1.00); every captured stake is under the per-bet cap; zero edge within the allowance is observed at both captured stakes, and it is what Duel's client code (as served 5 Oct 2026) computes when the allowance covers the stake; server settlement above $1.00 was not observed; the settlement parameters are operator-tunable | Step 9; settlement formula; admin-tunable parameters below |
| DL-6 | Simulation statistics partly read, not re-derived | Pass 1: none since 26 Sep 2026 — all 10 streams are replayed and lag1R, runsZ/runsP and the convergence series recomputed (until then they were simulator scalars); Pass 2: 1,000 beacon values per seed (framework floor 10,000), count-threshold null, no detection power stated | Steps 14–15 |
| DL-7 | The wheel layout is not cryptographically committed | the position → colour table is verified on every captured round, not committed ahead of play | Steps 8, 13; wheel layout below |

### Load-bearing premises

| ID | Premise | Could the captured data contradict it? | Status |
|----|---------|----------------------------------------|--------|
| P1 | The capture records what Duel served | Only in part: a forged round would still have to recompute from a seed that hashes to its commitment and a beacon value that equals the public chain's | ASSUMED (browser-session capture) |
| P2 | Duel derives every position with the algorithm in `src/rng.ts` | Yes — 1,350/1,350 recompute (Step 5) | Witnessed for captured rounds |
| P3 | The wheel table is the one in `src/rng.ts` | Yes — every served multiplier equals it (Step 8) | Witnessed for captured rounds; ASSUMED between them (DL-7) |
| P4 | Duel cannot predict or influence the drand beacon | No | ASSUMED (drand threshold network) |
| P5 | The transactions-API timestamp is when Duel accepted the bet | No — it is the operator's own clock | ASSUMED |
| P6 | The server seed was fixed before the beacon was published | Not directly (DL-3) | ASSUMED; Step 2 and P5 time the bet, not the seed |

### Residual operator trust

- **Game-to-drand round mapping.** The rule the server uses to pair a game round with a drand round is not published. Round IDs are strictly increasing and consistent with the chain, which shows ordering only: no beacon round reused or out of order. A player cannot predict in advance which drand round a game round will use. With a round's seed fixed, a different later beacon can give a different position, and choosing among beacons already published needs no prediction; advance beacon selection was not verified, and that it is possible in principle is not a finding that it happened.
- **drand chain liveness.** The game depends on the League of Entropy continuing to operate the quicknet chain; an outage would need a fallback. This is an external dependency, not an operator trust issue.
- **Wheel layout integrity.** The position → colour table was verified against the captured rounds but is not cryptographically committed. It could change between audits without detection; players rely on the UI matching the server-side mapping (DL-7).
- **Admin-tunable settlement parameters.** The four metadata values can change at any time through Duel's admin panel; the payload reflects the live state, with no change log or signed commitment, so a player cannot prove what the parameters were on an earlier day. The $50,000 daily and $1,000 per-bet ceilings are operator-stated and visible in the UI only as a derived per-tile edge, not as raw fields at `/api/v2/metadata/roulette` (none in E10, the duel.com config as fetched 2026-10-05 in a logged-in session (read-only GET)). Duel's client code reads the player's remaining daily allowance as `zeroEdgeStatus.daily_wager_remaining`; the endpoint that serves it was not identified or fetched. Unlike the drand-anchored outcome, the parameter set has no external commitment. This is a settlement-stage dimension outside the audit's empirical scope, not a defect of the RNG or game engine.

### Recommendations and scope boundaries

- **R-CR-CONFIG (medium priority).** Publish the two Zero Edge allowance ceilings as structured fields at `/api/v2/metadata/roulette` (for example `"daily_zero_edge_allowance": 50000` and `"per_bet_zero_edge_cap": 1000`); publish the discount formula on a player-visible surface such as the Castle Roulette fairness FAQ; keep a timestamped change log for `bankroll`, `min_house_edge_limit`, `max_house_edge_limit`, `exposure_percent` and the allowance ceilings. The verdict holds without it; it closes the remaining disclosure gap.
- **R-1 (low priority).** Show the drand round ID beside the server seed hash in the pre-round commitment display, so a player can query the beacon in real time (for example at `api.drand.sh/52db9ba.../public/{roundId}`). All data is already revealed after the round.
- **R-2 (low priority).** Show the quicknet chain hash (`52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`) and a link to `api.drand.sh` on the fairness verification page.
- **R-MULTI (future scope).** A multi-account audit would place bets from two funded accounts in the same round and compare the commitments each receives over the WebSocket.
- **Bracket boundaries.** Castle Roulette has no per-bet-size bracket table; the edge above the allowance is described by the single formula read from Duel's client code (server settlement not observed), checked against a live-UI screenshot at a $25,000 candidate stake on the five tiles from 4× to 48× (the 2× tile showed no figure; the client code gives 0.1% there). No bet above $1.00 was placed, so the edge above the allowance is a reading of the client code, not an observed settlement.

The HMAC-SHA256 implementation, the commitment-per-round design, the 100% baseline of the wheel and paytable and the position → colour mapping need no change.

## Terms

**Baseline RTP:** the wheel and paytable's expected return before any settlement-stage edge; 100.0000% here. **Settlement edge:** the reduction of a win's multiplier at settlement that Duel discloses, computed in Duel's client code by the formula above (server settlement not observed); 0 on every captured win (Step 9). The dataset's `effectiveEdge` field is written as 0 by the capture script, not served, and is not scored. **Zero Edge:** Duel's dual-cap allowance ($50,000 per 24 hours, $1,000 per bet) that discounts the settlement edge, which Duel states is applied in Castle Roulette by in-game multiplier reduction (operator disclosure; not observed, since all 473 captured wins were credited the full multiplier). **Colour tier:** the group of positions sharing a multiplier. **Position:** the integer 0–47 where the wheel lands, `uint32 % 48`. **Commit-reveal:** publish a seed's SHA-256 hash before play, reveal the seed after. **drand / quicknet:** the League of Entropy's public randomness beacon; the quicknet chain publishes a BLS threshold signature every 3 seconds. **BLS threshold signature:** a signature that needs a threshold of independent signers, so no single party can produce or predict it. **commitmentBeforeDrand:** beacon publication time minus the operator's bet timestamp, in milliseconds. **Modulo bias:** the uneven share a modulo reduction gives some outcomes; bounded by 1/2³² per outcome for a uint32. **Rejection sampling:** discarding values outside an evenly divisible range; not used here. **Fisher's method:** combining K independent p-values as `T = −2 Σ ln(p_i)`, χ² with 2K degrees of freedom. **Serial independence:** no dependence between consecutive outcomes, tested by lag-1 autocorrelation and the Wald-Wolfowitz runs test.

## Release history

| Release | What changed | Verdict |
|---------|--------------|---------|
| `v1.0.0` | The original audit. | PROVABLY FAIR — Full Pass |
| `v1.1.0` | Re-certification under Framework 1.1, October 2026, below. The dataset of record is unchanged. | unchanged |

### v1.1.0 — what changed

- **Scored steps: 17 in v1.0.0, 19 now.** The verdict is unchanged, PROVABLY FAIR — Full Pass. The dataset of record is byte-identical to v1.0.0. New: Configuration Coverage (coin tiers and wheel positions) and Live-Sample Fit (informational). Step 19 and the value domains in Step 18 were added on 26 September 2026.
- **RTP claim table.** `outputs/rtp-claim-table.json` tables the six colour tiers (true minimum 100.000000%, true maximum 100.000001%). Under RTP-CLAIM 1.2.0 its claim is the Zero Edge line, noted, not tested (outcome NOTED); until 14 October 2026 it was a flat 100% claim, outcome pass.
- **Errata (2026-09-29):** the RTP convergence chart loaded Chart.js from cdn.jsdelivr.net at a floating major version (chart.js@4), so what rendered depended on whatever 4.x the CDN served that day. Chart.js 4.4.7 is now inlined, byte for byte from the npm package pinned in package-lock.json. Two chart labels were also corrected: "zero edge" described the wheel and paytable, which return 100% by construction, not the game at every stake, since settlement can carry an edge the capture never exercised. Every figure is unchanged (final RTP 100.0070%).
- **Screenshots E05 and E06:** other players' usernames (the live chat and the names under the bet tiles) are masked with solid boxes; every other pixel is unchanged. The captured SHA-256s are kept in the [evidence register](#evidence).
- **Step 9 rebased on served settlement data (4 October 2026).** It used to count the dataset's `effectiveEdge` field, which the capture script writes as a literal 0. It now takes the 473 wins from the recomputed tier and requires each served credit to equal the served stake × the table multiplier exactly at 18 dp: 473/473, verdict unchanged. Mutation M09 now forges a win credited at a 0.1% edge; the battery's disposable copy now carries `outputs/rtp-claim-table.json`, without which its baseline was not green, and the re-run killed 31/31. On 5 October 2026 the settlement formula is restated in the order Duel's client code computes the displayed edge (`useRouletteScalingEdge-aDyPphv5.js` as served that day, cited as a reading and not pinned; server settlement not observed): the allowance comes off the stake first, then the bankroll formula, then the 0.1% floor and 5% ceiling, with zero edge while the allowance covers the stake, as the captured credits show; in that code Zero Edge covers castle roulette. The live-UI check is scoped to the five tiles that show a figure in the 22 May 2026 screenshot (4× to 48×; the 2× tile shows none, where the client code gives 0.1%), the enrichment step is published as `capture/castle-roulette-enrich.reference.js`, and the transactions-API match is described as the code does it (drand round id and colour bet, not `round_id`). The `/api/v2/metadata/roulette` response in the duel.com config as fetched 2026-10-05 in a logged-in session (read-only GET) is added as E10, with four streaming-vendor values (a subscriber token, an account id, a media-storage id and a stream URL) and the live host's personal data replaced by `"REDACTED"`; the parameter table cites it, and its four values are the ones the table already gave.
- **Commitment timing wording (5 October 2026).** A seed matching its hash is described as a consistency check, not as evidence of when the commitment was shown; for the captured rounds the ordering rests on the operator's transactions-API bet timestamps as recorded by the capture (P1, P5, P6, DL-3). Verify a bet now tells the player to save the commitment before betting and compare the revealed seed with that saved value, and E06 is labelled illustrative. The profile notes on Steps 2, 3, 12 and 16 changed with it, so the verification result was regenerated with `PF_EMIT=1 npm run verify` and the release manifest refreshed; no verdict, step result or number changed. `npm run timing` now prints the margin as a measurement on the operator's clock, not as a proof.
- **Beacon ordering and seed timing claims narrowed (6 October 2026).** Step 3 now claims only what it checks, that drand round IDs strictly increase with no beacon round reused or out of order, and states that advance beacon selection (the server choosing which later beacon a round uses) was not verified; the conclusion, round lifecycle, S2, residual operator trust and README now say the same. S5-4 keeps Pass (limited power) for selecting seeds by outcome (Step 15) and marks a seed chosen after the beacon as not established by this capture (P6, DL-3), and the LOW cherry-pick sentence under Limitations is now conditional on P6. The Step 3 detail, its profile note and the CASTLE-06 not-applicable reason changed, so the verification result was regenerated with `PF_EMIT=1 npm run verify` and the release manifest refreshed; no verdict, step result or number changed.
- **Capture provenance, Step 2 name, settlement attribution and release notes (6 October 2026).** Dataset and capture now states that the enrichment step also overwrote `result.serverSeed`, `result.serverSeedHash` and `result.drandRandomness` with the matched transaction's values where the transaction carried them (`capture/castle-roulette-enrich.reference.js` lines 100–102), that the dataset does not record for which rounds, and that the stored hash may come from the `rolling`, `roll` or `end` message or from the transactions API, with no receipt time kept; the conclusion, README, S5-1, S5-4, Verify a bet, Limitations and DL-3 now say the hash was not preserved as a timed pre-round observation, where they said it was not captured, and S5-1 calls it the commitment stored in the round's result record and S2 the commitment stored with its result, where they said served with it. Step 2 is renamed "Bet Before drand Beacon" (was "drand Commitment Timing (Pre-Commitment)"), because it times the bet, not the commitment; DL-3, P6 and the CASTLE-17 profile note now say that the seed was fixed before the beacon is premise P6 and that Step 2 and P5 time the bet, not the seed, and the comments in `src/loader.ts`, `src/types.ts`, `tests/steps/commitment.ts` and the `npm run timing` headings no longer call the margin pre-commitment. The README, the conclusion, the settlement-formula section and Terms attribute the settlement edge and the multiplier reduction to Duel's disclosure and client code (server settlement not observed); the README and DL-5 say stakes above $1.00 were not exercised (the README said $1,000), and so does Verify a bet (it said $1,000); the bracket-boundary note no longer compares this package with other Duel originals; the capture reference comment and the CASTLE-14 profile note no longer say "zero edge". The "Added" line below no longer lists the 18 Markdown report files as present, and the 4 October entry now says only the dataset, the `evidence/` directory and the tests were unchanged (it said the outputs, evidence files and source were too). The Step 2 name and the CASTLE-14 and CASTLE-17 profile notes changed, so the verification result was regenerated with `PF_EMIT=1 npm run verify` and the release manifest refreshed; no verdict, step result or number changed. The dataset is unchanged.
- **Added:** `LICENSE` (MIT), `.nvmrc` (Node 22), `RELEASE-MANIFEST.json` (written by `scripts/release-manifest.mjs`) and the mutation battery (`npm run mutate`, `tests/mutations.json`). The 18 Markdown report files this release first added were consolidated into README.md and this MANIFEST.md on 4 October 2026 (below).

### 4 October 2026 — consolidated documentation

The package's 20 Markdown documents were reduced to **README.md and this MANIFEST.md**. Repeated explanations were removed; the dataset, the `evidence/` directory and the tests are unchanged. Documentation references in the profile-coverage map (`src/profile-map.ts`) and the RTP claim source (`src/rtp-settings.ts`) now point to the retained sections, so the claim table and verification result were regenerated with the package's own commands and the release manifest refreshed; every numerical result is unchanged. Where the former chapters disagreed, this overview follows the verifier output and the most recent chapter: 24 unit tests and 19 steps (not 20 and 17), a per-position reduction bias of 1.552e-10 (not 2.33 × 10⁻¹⁰, which is the 2⁻³² ceiling), drand.cloudflare.com as the source `npm run timing` fetches, and Duel's Verify-tab code as vendored (E09). No new capture, simulation regeneration or mutation run is asserted for this update.

### 14 October 2026 (second pass) — an RTP miss ends RTP FIGURE OVERSTATED (FIXPASS2 class C3)

No verdict, scored step status, figure or artifact changed.

- **Why no exit-5 mutation here.** The claim is kind `noted` (the Zero Edge line), so RTP-CLAIM never finds a miss and no change can make this package end RTP FIGURE OVERSTATED, exit 5. Measured on 14 October in a copy: with the green tier lowered 48× → 47× in `src/rng.ts` and the RTP table and record regenerated, the rule line reads `NOTED, never scored as a miss` and the run ends NOT PROVABLY FAIR, exit 1, through Steps 5, 8, 9 and 17 (captured rounds landed on that tier). An exit-5 path would need a stated figure; decision D3 records the zero-edge line as noted.
- **Exit-5 mutations.** `scripts/mutate.mjs` gained `regen` (in the disposable copy: the RTP table rewritten by `src/rtp-settings.ts` and re-pinned, then the committed record re-emitted with `PF_EMIT=1`), `expectExit` (an entry counts as killed only when the run also ends with that exit code) and runner `test` (mocha, then the verifier, as `npm test` runs them). No entry was added.
- **Battery (Apple M2 Max, 12 cores, Node v22.23.1).** The whole registry in one `npm run mutate` on this tree, 14 October 2026 evening (baseline verify and mocha exit 0): 31/31 killed, 19/19 scored steps covered. On 15 October `--only` (now taking several comma-separated substrings) reran the one entry naming Step 13, the RTP-claim step: M13 1/1 killed.

### 14 October 2026 — Methodology v1.1

No draw check, scored step status, figure or verdict changed. The dataset and the artifacts pinned in `src/artifact-pins.ts` are unchanged; the RTP-claim table, pinned in `src/rtp-settings.ts`, was rewritten and re-pinned (below).

- **Framework 1.1.** The audit is re-certified under ProvablyFair.org Framework 1.1 (decision D1); the release manifest's `framework` field and the release row above say 1.1.
- **RTP-CLAIM 1.2.0, switched on.** `src/rtp-claim.ts` is the framework's rule 1.2.0, byte-identical to `core/rtp-claim.ts` (SHA-256 `c9a9c1c4…5f131c`), and `src/rtp-claim-switch.ts` is set to true (decision D3). The claim is now kind `noted` (decision D3: zero-edge lines are noted, not tested). The former flat 100% claim was the zero settlement edge measured on the 473 winning rounds, which is Duel's Zero Edge allowance and not a figure the game settings state: the game settings (E10) state the settlement edge beyond the allowance, a 0.1% floor and a 5% ceiling. The six colour tiers are still tabled; the outcome is NOTED, status INFO, so Step 13 (CASTLE-19) does not move. A house-side miss can never arise under a noted claim; the RTP FIGURE OVERSTATED path (exit 5) is wired as in every Duel package. In `outputs/rtp-claim-table.json` the `ruleVersion` and the claim changed and each row's gap, side and outcome now read null / noted / NOTED; no RTP changed. See [RTP claim table](#rtp-claim-table).
- **Profile.** The Castle Roulette profile version this suite cites is 1.0.2 (decision D6, approved as cited; the `-proposed` suffix is dropped, no check changed). In `outputs/verification-results.json` only `profileCoverage.profileVersion` changed.
- **S5 level.** The adversarial matrix states the S5 level received: the fairness-integrity matrix; game-integrity testing was not commissioned (decision D5).
- **Exit 5** (RTP FIGURE OVERSTATED) is added to the exit codes.
- `outputs/rtp-claim-table.json` was rewritten with `npm run rtp-claim:write` and re-pinned, `outputs/verification-results.json` regenerated with `PF_EMIT=1 npm run verify`, and the release manifest refreshed with `npm run release-manifest`. The mutation battery was rerun: 31/31 killed, 19/19 scored steps covered.

### 19 October 2026 — wording before tagging

No step, figure, artifact or verdict changed; README.md, this overview and the header comment of `src/rng.ts` were edited.

- **The position code's origin.** `src/rng.ts` was ported from Duel's published verification code; the conclusion no longer says the positions were "independently reproduced", and the overview, README and the `src/rng.ts` header say it is a port checked against Duel's Verify-tab code (Step 5), not a rebuild from a specification. The `src/rng.ts` header no longer says "House edge: 0%"; it says the wheel and paytable baseline is 1.000 per tier and the settlement-stage edge is outside the file.
- **Capture script listed.** `capture/castle-roulette-capture.js`, the runnable capture script, is now named in [Dataset and capture](#dataset-and-capture) and the source-file table, with the reason the release carries only its reference records.
- **Timing table.** The fresh-clone table under [Reproduce the audit](#reproduce-the-audit) was measured on the 18-step suite of 26 September 2026; it was re-measured on the current suite (24 unit tests, 19 steps), and the README's run time follows it.
- **Release status.** "Not yet released" and the README sentence calling the release a draft pending its tag and signature were removed; the release manifest records the signing key's fingerprint.

### Where the former chapters went

| Former documentation | Consolidated location |
|---|---|
| Executive summary and conclusion | Conclusion and scope; README |
| Game rules, system architecture, RNG algorithm analysis and game logic & verifiability | Game and algorithm; Payouts and RTP |
| Payout verification and RTP analysis | Payouts and RTP |
| Live parity testing and drand timing methodology | Dataset and capture; Verification results |
| Exploit testing and edge-case analysis | Verification results; Payouts and RTP |
| Reproducibility guide | Reproduce the audit |
| "Verify one of your own rounds" | Verify a bet |
| Evidence appendix | Evidence |
| Operator trust analysis and recommendations | Limitations and trust |
| Glossary | Terms |
| Table of contents (SUMMARY.md) | Contents; README |
