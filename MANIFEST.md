# Manifest — Duel Castle Roulette Audit

- **Audit ID:** PF-2026-DL07
- **Publication date:** 4 June 2026
- **Audit report:** https://audit.provablyfair.org/casino/duel/games/castle-roulette/overview
- **Auditor:** ProvablyFair.org
- **Audit date:** April 2026

## Algorithm

HMAC-SHA256 combining the server seed (committed before the round) with the drand quicknet BLS signature. The combined output selects a wheel position; the position maps to a color tier. RTP = 100.0000% by the count×multiplier=48 identity; per-tier EV deviation from the modulo bias is ~7.45e-9 (negligible).

```
key       = hexDecode(serverSeed)
drandBytes= hex_decode(drandSignature)
message   = drandBytes.toString('utf-8') + ":0"
hmac      = HMAC-SHA256(key, message)
value     = parseInt(hmac[0..7], 16) % wheelPositions
color     = wheelMap[value]
multiplier= tierMultiplier[color]    // count × multiplier = 48 per tier → P × multiplier = 1.000
```

## Dataset

- **File:** `data/castle-roulette-master-1350rounds.json`
- **SHA-256:** `506e05ee9c07966a721715cd7d7b369e72159601b6a6439542330b311ffd66ce`
- **Total rounds:** 1,350
- **Phases:** A (800) · B (200) · C (100) · D (100) · E (150)

## Verification

- **Verification steps:** 16 scored steps in `tests/verify.ts`
- **drand commitment timing:** every round bet placed before drand publication (authoritative transactions-API timestamp + drand chain formula)
- **Unit tests:** Mocha (`tests/**/*Tests.ts`)
- **Simulation:** 5,000,000 rounds
- **House edge:** **0% by construction** — `effectiveEdge = 0` in all 1,350 captured rounds
- **Theoretical RTP:** 100.0000% by the count×multiplier=48 identity; per-tier EV deviation from the modulo bias is ~7.45e-9 (negligible)
- **Expected `npm test` result:** 16/16 PASS · PROVABLY FAIR — Full Pass

## Reproducibility

Cloning this repo at the publication commit and running `npm install && npm run timing && npm test` reproduces the entire audit pipeline. The dataset hash is verified at startup; the verifier recomputes every wheel position from `(serverSeed, drandSignature)`; the drand commitment timing is reproduced from the public quicknet chain formula (`publish_time = genesis + (round − 1) × 3`, `genesis = 1692803367`).
