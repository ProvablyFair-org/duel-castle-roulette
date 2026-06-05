# Duel Castle Roulette — Verifier

Independent verifier for the ProvablyFair.org audit of **Duel.com Castle Roulette**.

- **Audit report:** https://audit.provablyfair.org/casino/duel/games/castle-roulette/overview
- **Audit ID:** PF-2026-DL07
- **Audited:** April 2026
- **Algorithm:** HMAC-SHA256 + drand quicknet (external randomness beacon)

**Distinguishing feature:** Castle Roulette has **zero house edge by construction** — every color tier has `count × multiplier = 48`, so `P × multiplier = 1.000`. RTP = 100.0000% (to 4 dp; residual modulo bias shifts per-tier EV by ~7.45e-9, negligible).

## What's in this repo

This is the verification codebase. It re-derives every audited Castle Roulette wheel position from the captured dataset, the published algorithm, and the drand chain. The full audit report — methodology, evidence, findings, recommendations — lives on the docusaurus page linked above.

## Reproduce

```sh
git clone git@github.com:ProvablyFair-org/duel-castle-roulette.git
cd duel-castle-roulette
npm install
npm test           # unit tests + simulation + verification (16 scored steps)
```

The repo ships `outputs/drand-api-verification.json` pre-computed (1,350 drand BLS signatures matched byte-for-byte against the public quicknet API at `api.drand.sh`), so `npm test` works **offline**. Expected: 16/16 PASS, **PROVABLY FAIR — Full Pass**.

To regenerate the drand verification artifact from scratch (requires internet, fetches all 1,350 signatures from `api.drand.sh`):

```sh
npm run timing
```

Individual scripts:

```sh
npm run timing     # drand chain formula + bet-placement margin + drand API signature verification (network)
npm run simulate   # 5M-round multi-stream simulation (10 × 500K, Fisher's method)
npm run verify     # 16-step verification of the captured dataset
```

## Dataset

- **File:** `data/castle-roulette-master-1350rounds.json`
- **SHA-256:** `506e05ee9c07966a721715cd7d7b369e72159601b6a6439542330b311ffd66ce`
- **Rounds:** 1,350 across 5 capture phases (A: 800 · B: 200 · C: 100 · D: 100 · E: 150)

The verifier confirms the dataset hash before running any checks.

## License

MIT
