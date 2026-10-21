# Duel Castle Roulette — Provably Fair Audit

**Auditor:** [ProvablyFair.org](https://www.provablyfair.org) · **Audit ID:** PF-2026-DL07 · **Release:** `v1.2.0` · **Capture:** 22–23 April 2026

**Result: PROVABLY FAIR — Full Pass.** Every wheel position in the 1,350-round dataset was reproduced from the revealed server seed and the drand quicknet beacon. The verifier reports 19 of 19 scored steps passing, no flags and no hard failures. All 1,350 drand signatures equal the values the public beacon API returned for their rounds.

**Scope:** The wheel and paytable return a **baseline RTP of 100.0000%** by construction (`count × multiplier = 48` on every colour tier), before any settlement-stage edge. Per Duel's disclosure, that edge is applied at settlement; its Zero Edge formula over operator-tunable parameters is read from Duel's client code, which computes the edge the UI displays (server settlement not observed). All 473 winning rounds were credited the full multiplier, a settlement edge of 0; the captured stakes ($0.01 and $1.00) all sit under the $1,000 per-bet allowance (while the $50,000 daily allowance lasts). Stakes above $1.00 were not exercised, and theoretical RTP is not a promise about an individual session's return.

## What was verified

| Check | Captured evidence |
|---|---|
| Positions | 1,350 of 1,350 wheel positions recomputed from `(serverSeed, drandRandomness)`; 0 mismatches. The position code (`src/rng.ts`) was rebuilt from a written specification ([docs/ALGORITHM.md](docs/ALGORITHM.md)) by an implementer who never opened Duel's code; Duel's published Verify-tab code is run as a second check, not used as the source (Step 5) |
| Payouts | 1,350 of 1,350 payouts match the position → tier table; the capture-recorded `isWin` flags agree with it |
| Commitments | 1,350 distinct server seeds, each hashing to its own commitment; one seed per round |
| drand beacon | 1,350/1,350 signatures matched byte for byte against drand.cloudflare.com; publication times follow the quicknet chain formula |
| Timing | Every bet accepted before its beacon was published on the operator's transactions-API clock (min 14.763 s, mean 20.067 s, max 20.405 s) |
| Coverage | All 6 colour tiers above the 30-round floor; 48 of 48 wheel positions landed on |
| Baseline RTP | 100.0000% from the wheel geometry alone; per-tier deviation from the plain `% 48` reduction at most 7.451e-9 |
| Settlement edge | 473 of 473 winning rounds credited stake × table multiplier exactly at 18 dp, from the served credit and stake: a settlement edge of 0 at the captured stakes |
| Simulation | 5,000,000 Pass 1 rounds (Fisher's T = 15.09, p = 0.7712) and 1,350 casino seeds × 1,000 beacon values in Pass 2 |
| Player verification | Duel's own Verify-tab code (the second check) and the ProvablyFair.org docs-site verifier reproduce all 1,350 positions |

The bet-before-beacon ordering rests on the operator's own bet timestamp, and the server-seed hash was not preserved as a timed pre-round observation. Increasing drand round IDs show ordering only; advance beacon selection (the server choosing which later beacon a round uses) was not verified. These boundaries, the single test account and the operator-tunable settlement parameters are set out in the [overview's limitations](MANIFEST.md#limitations-and-trust).

## Run the audit

Open a terminal in the package directory. Use **Node 22.x**, as declared in [.nvmrc](.nvmrc) and [package.json](package.json).

```sh
npm ci
npm test
```

Expected: **24 unit tests pass; Passed 19/19, 0 flags, 0 hard fails; PROVABLY FAIR — Full Pass; REPRODUCED; exit 0.** This recomputes every captured round offline, checks the pinned artifacts and compares the fresh verification result with the committed one. It replays the stored simulation from its pinned seeds; it does not regenerate the simulation files. The exit code is the verdict: `0` PROVABLY FAIR — Full Pass · `2` PROVABLY FAIR — Conditional Pass · `5` RTP FIGURE OVERSTATED (the RTP-CLAIM rule 1.2.0 found a published RTP figure above the game's real RTP; the draws pass) · `1` NOT PROVABLY FAIR, or a reproduction difference.

**RTP claim (RTP-CLAIM 1.2.0, switched on).** The claim is kind `noted`: the zero settlement edge measured on all 473 winning rounds is Duel's Zero Edge allowance, and under Methodology v1.1 a zero-edge line is recorded, not tested. The six colour tiers are still tabled (100.000000% to 100.000001%; [table](outputs/rtp-claim-table.json)); the outcome is NOTED and moves no step. The settlement edge beyond the allowance, a 0.1% floor and 5% ceiling in Duel's game settings, was not reached by any captured stake (DL-5).

```sh
npm run test:full                 # optional: regenerate the simulation into outputs/run/, then verify
npm run timing                    # optional, network: re-fetch every drand signature
node scripts/release-manifest.mjs --check
```

On a fresh clone on 19 October 2026, `npm test` took 82 s and `npm run test:full` 114 s, on a machine shared with other runs. Ordinary runs write to `outputs/run/` and leave the evidence of record intact. See [reproduction details](MANIFEST.md#reproduce-the-audit) for the comparison rules, exit codes, mutation battery and the deliberate artifact-refresh procedure.

## Verify a bet

Before you bet, save the round's server seed hash as shown for that round. Open the round's Provably Fair panel after it spins and copy the server seed, its hash, the drand round ID and the drand randomness. Hash the decoded seed bytes and compare the result with the hash you saved: a PASS means the two hashes are equal, which shows the seed is consistent with the commitment; the assurance that the commitment existed before your bet comes from your saved copy, not from the match. Check the beacon against any drand quicknet relay, compute `HMAC-SHA256` over the decoded beacon read as UTF-8 plus `":0"`, and reduce the leading uint32 modulo 48. The [complete verification instructions](MANIFEST.md#verify-a-bet) give the encodings, the 0-based position → tier table and the settlement rule.

## Files and evidence

There are two documentation files: this README and [MANIFEST.md — consolidated audit overview](MANIFEST.md). The overview contains the game rules, algorithm, RTP calculation, settlement formula, verification results, evidence, limitations and release history.

- [Captured rounds](data/castle-roulette-master-1350rounds.json) — SHA-256 `506e05ee9c07966a721715cd7d7b369e72159601b6a6439542330b311ffd66ce`.
- [Verification results](outputs/verification-results.json), [RTP claim table](outputs/rtp-claim-table.json), [simulation results](outputs/simulation-results.json), [drand API check](outputs/drand-api-verification.json) and [release manifest](RELEASE-MANIFEST.json).
- [Algorithm specification](docs/ALGORITHM.md) — the written specification `src/rng.ts` is rebuilt from.
- [Duel's Verify-tab code](evidence/verify-tab/duel-verify-tab-castle-roulette-2026-09-26.js) (the second check) — SHA-256 `c83dca216f2d79aee3f8d60fa663528a9b6298a157d0851450c0f31c5de92bc7`.
- [Audit report](https://audit.provablyfair.org/casino/duel/games/castle-roulette/overview) · [Public repository](https://github.com/ProvablyFair-org/duel-castle-roulette) · [MIT license](LICENSE).

The release manifest records the fingerprint of the ProvablyFair.org signing key (`signature`). The consolidation of the documentation is recorded in the [release history](MANIFEST.md#release-history).
