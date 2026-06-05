/**
 * Castle Roulette — Mocha unit tests.
 * Tests the RNG implementation, hash verification, position mapping, and statistics.
 */

import { strict as assert } from 'assert';
import { computePosition, verifyHash, getResult, PAYOUT_TABLE, RANGE, moduloBias } from '../../src/rng';
import { chiSquaredTest, chiSquaredPValue, lag1Autocorrelation, regularizedGammaP } from '../../src/stats';
import { loadDataset } from '../../src/loader';

describe('Cryptographic Core — Known-Answer Tests (5 hand-picked rounds — proves our algorithm implementation is correct)', () => {
  const VECTORS = [
    {
      serverSeed: 'adace83dfe4957273152c5c52aea5e4fc112dabef87ff4baa350ca652420eb26',
      drand: '8d59f6f2c17c6c3a77f65dfc4b5530bb607c8891d21a90cdff2628d69a461ca692b6ad3c041e1c7a8a9d87005cd6621d',
      expectedPosition: 27,
      serverSeedHash: 'ae7a5f98e2f4785022a58890db980cb71bb9f0c1bd02a44a1d69699ad18baaaa',
    },
    {
      serverSeed: '1120be12acd15f7649d79ebda52412ff000667166d49c100f2af329e06833c6b',
      drand: '865322eddc7b7ec1ad777a3456f4c5bd51b07b9844fc55ae9b1d49d17c9e71a97e73d4af929d6e9536eb387fd455df57',
      expectedPosition: 16,
      serverSeedHash: 'f682a789d136e31a6fad9cd2a67703c049df72bbc95df8382e95391bd9c47244',
    },
    {
      serverSeed: '8ce00e0a6fb8d18dd7ff42c5f5b216a57bca257da5256f3735553efaae5a368a',
      drand: '9581b336e7c302d10cc584d4a8b90ba8bc038d8b6f53cb4bb097cb39d353bd7acb3c64c59d8afefdbe7ab39280162389',
      expectedPosition: 6,
      serverSeedHash: '3eae2c59dd03f1f4e5b58c2301082c707c72d540a7043379fbfd1a009ec8382c',
    },
    {
      serverSeed: 'ecc8a3397a363012ad9bad4697273578ef5309be52dee11d6fb0faf758e4dded',
      drand: 'a383accb5b76da48f712836ddb015fa2602a47f0e7894084e85acaaab16f2711aba033782c7d18eafc9f25b6ab8d1589',
      expectedPosition: 12,
      serverSeedHash: 'e4aced23128acc20c6be47f2accdda23c5630f99223bf2117fab2e02362f90ed',
    },
    {
      serverSeed: 'a8193b5e35a1f31c867234ed64bb287835a96fb4eda130494e302b70f54a305d',
      drand: '97e957e96fb85cd64917b9b027da8ca5db28c7f435227733a2e71a55916de960ada65553509123db3a628ee656740bc9',
      expectedPosition: 7,
      serverSeedHash: 'ae2858e11762979555cac7234c191fbc78da7c81a524fba6f21f4bcc3b3d98c9',
    },
  ];

  it('computePosition matches the expected position for each of 5 distinct rounds', () => {
    for (const v of VECTORS) {
      const result = computePosition(v.serverSeed, v.drand);
      assert.strictEqual(result, v.expectedPosition, `serverSeed ${v.serverSeed.slice(0, 8)}... expected pos=${v.expectedPosition}, got ${result}`);
    }
  });

  it('SHA-256(serverSeed) matches the committed hash for all 5 known server seeds', () => {
    for (const v of VECTORS) {
      assert.strictEqual(verifyHash(v.serverSeed, v.serverSeedHash), true, `hash mismatch for ${v.serverSeed.slice(0, 8)}`);
    }
  });

  it('verifyHash rejects a tampered server seed (negative control)', () => {
    const v = VECTORS[0];
    const tampered = 'ff' + v.serverSeed.slice(2);
    assert.strictEqual(verifyHash(tampered, v.serverSeedHash), false);
  });

  it('verifyHash rejects a tampered hash (negative control)', () => {
    const v = VECTORS[0];
    assert.strictEqual(verifyHash(v.serverSeed, 'deadbeef'.repeat(8)), false);
  });

  it('position is always in range [0, 47]', () => {
    for (const v of VECTORS) {
      const pos = computePosition(v.serverSeed, v.drand);
      assert.ok(pos >= 0 && pos < RANGE, `position ${pos} out of range`);
    }
  });
});

describe('Cryptographic Core — Full Dataset Verification (all rounds — proves the server produced the same positions our code computes)', () => {
  const ds = loadDataset();

  it(`recomputes the position for every round in the dataset (${ds.rounds.length} rounds) and confirms 0 mismatches`, () => {
    let mismatches = 0;
    for (const r of ds.rounds) {
      const computed = computePosition(r.result.serverSeed, r.result.drandRandomness);
      if (computed !== r.result.position) mismatches++;
    }
    assert.strictEqual(mismatches, 0, `${mismatches} position mismatches`);
  });

  it(`verifies SHA-256(serverSeed) === serverSeedHash for all ${ds.rounds.length} rounds`, () => {
    let failures = 0;
    for (const r of ds.rounds) {
      if (!verifyHash(r.result.serverSeed, r.result.serverSeedHash)) failures++;
    }
    assert.strictEqual(failures, 0, `${failures} hash verification failures`);
  });
});

describe('Payout Table Integrity — validates the hardcoded position-to-color mapping', () => {
  it('payout table has exactly 48 entries', () => {
    assert.strictEqual(PAYOUT_TABLE.length, RANGE);
  });

  it('position 0 = Green 48×', () => {
    const r = getResult(0);
    assert.strictEqual(r.color, 'green');
    assert.strictEqual(r.multiplier, 48);
  });

  it('positions 1-2 = Red 24×', () => {
    for (let i = 1; i <= 2; i++) {
      const r = getResult(i);
      assert.strictEqual(r.color, 'red');
      assert.strictEqual(r.multiplier, 24);
    }
  });

  it('positions 3-5 = Purple 16×', () => {
    for (let i = 3; i <= 5; i++) {
      const r = getResult(i);
      assert.strictEqual(r.color, 'purple');
      assert.strictEqual(r.multiplier, 16);
    }
  });

  it('positions 6-11 = Blue 8×', () => {
    for (let i = 6; i <= 11; i++) {
      const r = getResult(i);
      assert.strictEqual(r.color, 'blue');
      assert.strictEqual(r.multiplier, 8);
    }
  });

  it('positions 12-23 = Grey 4×', () => {
    for (let i = 12; i <= 23; i++) {
      const r = getResult(i);
      assert.strictEqual(r.color, 'grey');
      assert.strictEqual(r.multiplier, 4);
    }
  });

  it('positions 24-47 = Dark Blue 2×', () => {
    for (let i = 24; i <= 47; i++) {
      const r = getResult(i);
      assert.strictEqual(r.color, 'dark_blue');
      assert.strictEqual(r.multiplier, 2);
    }
  });

  it('every tier has EV = 1.000 (zero edge by construction)', () => {
    const tiers = [
      { count: 1, mult: 48 },
      { count: 2, mult: 24 },
      { count: 3, mult: 16 },
      { count: 6, mult: 8 },
      { count: 12, mult: 4 },
      { count: 24, mult: 2 },
    ];
    for (const t of tiers) {
      const ev = (t.count / RANGE) * t.mult;
      assert.ok(Math.abs(ev - 1.0) < 1e-10, `EV for ${t.mult}× tier = ${ev}, expected 1.0`);
    }
  });

  it('modulo bias is negligible (< 1e-9 per position)', () => {
    const bias = moduloBias();
    assert.ok(bias.maxBiasPerPosition < 1e-9, `bias ${bias.maxBiasPerPosition} too large`);
    assert.strictEqual(bias.affectedPositions, 16);
  });
});

describe('Statistics', () => {
  it('chi-squared p-value for known values', () => {
    const p = chiSquaredPValue(3.84, 1);
    assert.ok(Math.abs(p - 0.05) < 0.005, `expected ~0.05, got ${p}`);
  });

  it('regularized gamma P(1, 1) ≈ 0.6321', () => {
    const p = regularizedGammaP(1, 1);
    assert.ok(Math.abs(p - 0.6321) < 0.001, `expected ~0.6321, got ${p}`);
  });

  it('chi-squared test with uniform data should pass', () => {
    const obs = [25, 23, 22, 26, 24];
    const exp = [24, 24, 24, 24, 24];
    const result = chiSquaredTest(obs, exp);
    assert.ok(result.pValue > 0.05, `expected passing test, got p=${result.pValue}`);
  });

  it('lag-1 autocorrelation on independent data near zero', () => {
    let x = 12345;
    const data = Array.from({ length: 1000 }, () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; });
    const r = lag1Autocorrelation(data);
    assert.ok(Math.abs(r) < 0.1, `expected near-zero autocorrelation, got ${r}`);
  });
});
