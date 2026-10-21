/**
 * Spec self-test — docs/ALGORITHM.md §1.3–§5 vectors and properties, run against src/rng.ts.
 *
 * Written by the clean-room implementer together with src/rng.ts, from docs/ALGORITHM.md and the module
 * interface alone (never from Duel's code). Integrated 20 Oct 2026: the checks are unchanged; only the
 * import path, the mocha wrapper and the reporting (failures collected instead of printed) were adapted.
 */
import { createHash, createHmac, randomBytes } from 'crypto';
import {
  RANGE,
  PAYOUT_TABLE,
  DRAW_HEX_CHARS,
  positionFromDigest,
  computePosition,
  computePositionFromBuffer,
  getResult,
  verifyHash,
  moduloBias,
} from '../../src/rng';
import * as assert from 'assert';

const EXPECTED_CHECKS = 119;

function runSelftest(): { pass: number; total: number; failed: string[] } {
let pass = 0;
let total = 0;
const failed: string[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  total++;
  if (ok) pass++;
  else failed.push(`${name}${detail ? '  ' + detail : ''}`);
}

const COIN_MULT: Record<string, number> = {
  two: 2, four: 4, eight: 8, sixteen: 16, twenty_four: 24, forty_eight: 48,
};

interface Vector {
  id: string; serverSeed: string; serverSeedHash: string; drandRoundId: number;
  published: number; betAtMs: number; drandSeed: string; randomness: string;
  messageHex: string; messageLen: number; hmac: string; u32: number; position: number;
  coin: string; tierCoin: string; win: boolean; multiplier: number;
  amount: number | null; amountWon: number;
}

// §5.1. `amount` is only stated for V2 ("stake 1"); V3 is a loss (0 regardless).
const V: Vector[] = [
  {
    id: 'V1', serverSeed: 'adace83dfe4957273152c5c52aea5e4fc112dabef87ff4baa350ca652420eb26',
    serverSeedHash: 'ae7a5f98e2f4785022a58890db980cb71bb9f0c1bd02a44a1d69699ad18baaaa',
    drandRoundId: 28007049, published: 1776824511, betAtMs: 1776824490621,
    drandSeed: '8d59f6f2c17c6c3a77f65dfc4b5530bb607c8891d21a90cdff2628d69a461ca692b6ad3c041e1c7a8a9d87005cd6621d',
    randomness: 'a0f726de1160479b246fb4c7c2704b3b4bce3ce879604825eb79357e87795885',
    messageHex: 'efbfbd59efbfbdefbfbdefbfbd7c6c3a77efbfbd5defbfbd4b5530efbfbd607cefbfbdefbfbdefbfbd1aefbfbdefbfbdefbfbd2628d69a461cefbfbdefbfbdefbfbdefbfbd3c041e1c7aefbfbdefbfbdefbfbd005cefbfbd621d3a30',
    messageLen: 92, hmac: 'd6b318ab366262e3139f86c6d1f6695b548ee0e56c05128f5ba0b8ae1b71b3b1',
    u32: 3602061483, position: 27, coin: 'two', tierCoin: 'two', win: true, multiplier: 2,
    amount: null, amountWon: 0.02,
  },
  {
    id: 'V2', serverSeed: '9d4721c7414516459a279c0577e88fd583e2339121c6cbd98557f652e791808d',
    serverSeedHash: 'd02f36db42cf89ae8d76c3c0169270f3916886638251212eec80ae66c10e9212',
    drandRoundId: 28026594, published: 1776883146, betAtMs: 1776883125773,
    drandSeed: '851e604a895dc2a13ace561cf219f72f91b76dbef987de9c246f320425da40882777f98edd04f26bc24e63e077c90a80',
    randomness: '55dca4c9b7990e75e49d6e7a2ef64e6b66ce25a83ef7e511106f6c768b1742ba',
    messageHex: 'efbfbd1e604aefbfbd5dc2a13aefbfbd561cefbfbd19efbfbd2fefbfbdefbfbd6defbfbdefbfbdefbfbdde9c246f320425efbfbd40efbfbd2777efbfbdefbfbdefbfbd04efbfbd6befbfbd4e63efbfbd77efbfbd0aefbfbd3a30',
    messageLen: 90, hmac: '3ebd086ba8c431ef22fa322ace2a0c35430da48ee8da034cd128325e6f1daab6',
    u32: 1052575851, position: 27, coin: 'two', tierCoin: 'two', win: true, multiplier: 2,
    amount: 1, amountWon: 2,
  },
  {
    id: 'V3', serverSeed: '1726a013573289c021223f32114ee754012c96d8bae142084bd2f7217af77498',
    serverSeedHash: '32069b261d26e46206fcb91afa8419e3cac86be5bf7c372baf2b18aa27b183c9',
    drandRoundId: 28022484, published: 1776870816, betAtMs: 1776870795753,
    drandSeed: 'b165350aebd5f05641d042ce59f296f0a256f24a8552cb89a7f480ab1f09418f8a721ac54590c0e6258c2d6e9c6f2199',
    randomness: '9002a78d29eebc8fcc9452f00706e0cb73c227b58bfb97706474b3af040b35fc',
    messageHex: 'efbfbd65350aefbfbdefbfbdefbfbd5641efbfbd42efbfbd59efbfbdefbfbd56efbfbd4aefbfbd52cb89efbfbdefbfbd1f0941efbfbdefbfbd721aefbfbd45efbfbdefbfbdefbfbd25efbfbd2d6eefbfbd6f21efbfbd3a30',
    messageLen: 88, hmac: '001dfa87bc9fe4982660b7556c2616c3139ad05e5dfb020faf29afb00651508d',
    u32: 1964679, position: 39, coin: 'eight', tierCoin: 'two', win: false, multiplier: 2,
    amount: null, amountWon: 0,
  },
  {
    id: 'V4', serverSeed: 'c3befbdb23570b76a3c091ef0fc57d177f0fdffbbcab8a66cc0087379f8ff116',
    serverSeedHash: '69ff2e868da41481c843375cf969b62fe94bd125cd6561a9d13c70fe473c6268',
    drandRoundId: 28033564, published: 1776904056, betAtMs: 1776904035882,
    drandSeed: '880616e5f423c3c9f0e2acb06de5aada0496fe09c78da00497593bdbd8babcb6da1b260074526eaa783224998a8b63d2',
    randomness: '9807f40a49f636a588900788098776235da85934653529b7c2123add422f0dff',
    messageHex: 'efbfbd0616efbfbdefbfbd23efbfbdefbfbdefbfbde2acb06defbfbdefbfbd04efbfbdefbfbd09c78defbfbd04efbfbd593befbfbdd8baefbfbdefbfbdefbfbd1b260074526eefbfbd783224efbfbdefbfbdefbfbd63efbfbd3a30',
    messageLen: 91, hmac: '839b89944992255ce8cd0c879dbd8e2a4d423fc88b4043b3328b3d1fe5906365',
    u32: 2208008596, position: 4, coin: 'sixteen', tierCoin: 'sixteen', win: true, multiplier: 16,
    amount: null, amountWon: 0.16,
  },
  {
    id: 'V5', serverSeed: '651a40d387346919ee59de3ac9858c3a8b20aa1d5dc78ecfd54d5a869bd5cfb5',
    serverSeedHash: '8930e42cbf5db531bf28177327324bea49f6711e8c19d7b0bcb61040a1d651a6',
    drandRoundId: 28034244, published: 1776906096, betAtMs: 1776906075881,
    drandSeed: '91f15725497c704c9f61ed8a7f5937067c7928022ba670f0b8fa5f7c23a1583649fd470a748e1413864038285f4c1332',
    randomness: 'a20a014382e5232205c589d0778dfc7c95ee3db31984185a90f75ff7a477d706',
    messageHex: 'efbfbdefbfbd5725497c704cefbfbd61efbfbd7f5937067c7928022befbfbd70efbfbdefbfbd5f7c23efbfbd583649efbfbd470a74efbfbd1413efbfbd4038285f4c13323a30',
    messageLen: 70, hmac: '07129a702e6f6237d190061776e058804613bf2be5c5bad2647bb221c8dec392',
    u32: 118659696, position: 0, coin: 'forty_eight', tierCoin: 'forty_eight', win: true, multiplier: 48,
    amount: null, amountWon: 0.48,
  },
];

const multToCoin = (m: number): string =>
  Object.keys(COIN_MULT).find((k) => COIN_MULT[k] === m) ?? '?';

// ---- §5.1 dataset vectors ----
for (const v of V) {
  // §1.3 commitment
  check(`${v.id} verifyHash true`, verifyHash(v.serverSeed, v.serverSeedHash));
  const flipped = v.serverSeedHash.slice(0, -1) + (v.serverSeedHash.endsWith('0') ? '1' : '0');
  check(`${v.id} verifyHash false on altered hash`, !verifyHash(v.serverSeed, flipped));
  // §1.4 beacon binding (spec arithmetic, independent of rng.ts)
  const sig = Buffer.from(v.drandSeed, 'hex');
  check(`${v.id} randomness = SHA-256(signature)`,
    createHash('sha256').update(sig).digest('hex') === v.randomness);
  const pub = 1692803367 + (v.drandRoundId - 1) * 3;
  check(`${v.id} publishTime formula`, pub === v.published, `${pub}`);
  check(`${v.id} bet before beacon publish`, v.betAtMs < pub * 1000,
    `gap ${pub * 1000 - v.betAtMs} ms`);
  // §2.2 message bytes (spec construction via TextDecoder, as O5 asks)
  const msg = Buffer.concat([
    Buffer.from(new TextDecoder('utf-8').decode(sig), 'utf8'), Buffer.from(':0'),
  ]);
  check(`${v.id} lossy-UTF8 message bytes`, msg.toString('hex') === v.messageHex,
    `${msg.length} B`);
  check(`${v.id} message length`, msg.length === v.messageLen);
  // §2.3 HMAC from the spec's message
  const key = Buffer.from(v.serverSeed, 'hex');
  const hmac = createHmac('sha256', key).update(Buffer.from(v.messageHex, 'hex')).digest('hex');
  check(`${v.id} HMAC`, hmac === v.hmac);
  check(`${v.id} u32 BE`, parseInt(v.hmac.slice(0, 8), 16) === v.u32);
  check(`${v.id} positionFromDigest`, positionFromDigest(v.hmac) === v.position);
  const p = computePosition(v.serverSeed, v.drandSeed);
  check(`${v.id} computePosition`, p === v.position, `${p}`);
  check(`${v.id} computePositionFromBuffer`, computePositionFromBuffer(key, v.drandSeed) === v.position);
  // §3.1-§3.3 tier, win rule, payout
  const r = getResult(p);
  check(`${v.id} tier`, multToCoin(r.multiplier) === v.tierCoin, `${r.multiplier}x ${r.color}`);
  check(`${v.id} landed-tier multiplier`, r.multiplier === v.multiplier);
  const win = multToCoin(r.multiplier) === v.coin;
  check(`${v.id} win rule`, win === v.win);
  if (v.amount !== null) {
    const won = win ? v.amount * COIN_MULT[v.coin] : 0;
    check(`${v.id} amountWon`, won === v.amountWon, `${won}`);
  } else if (!v.win) {
    check(`${v.id} amountWon (loss = 0)`, v.amountWon === 0);
  }
}

// ---- §5.2 Verify-page readings: (drand seed field, server seed field) -> roll ----
const D = V[0].drandSeed;
const S = V[0].serverSeed;
const readings: Array<[string, string, string, number]> = [
  ['D,S', D, S, 27], ['D,upper(S)', D, S.toUpperCase(), 27], ['S,D swapped', S, D, 36],
  ['00,00', '00', '00', 26], ['01,00', '01', '00', 5], ['00,01', '00', '01', 13],
  ['ab,ab', 'ab', 'ab', 28], ['abc,abc', 'abc', 'abc', 28], ['abc,ab', 'abc', 'ab', 28],
  ['ab,abc', 'ab', 'abc', 28], ['ff,ff', 'ff', 'ff', 14], ['D,00', D, '00', 39],
  ['00,S', '00', S, 43], ['zz,zz', 'zz', 'zz', 26], ['hello,world', 'hello', 'world', 11],
];
for (const [name, drand, seed, want] of readings) {
  const got = computePosition(seed, drand);
  check(`5.2 ${name}`, got === want, `${got}`);
}
let threw = false;
try { computePosition('a', 'a'); } catch { threw = true; }
check('5.2 a,a gives no result', threw);

// ---- §5.3 crafted rejection probe ----
const probeSeed = '00000000000000000000000000000000000000000000000000000000161fff60';
const probeKey = Buffer.from(probeSeed, 'hex');
const probeMsg = Buffer.concat([
  Buffer.from(new TextDecoder('utf-8').decode(Buffer.from(D, 'hex')), 'utf8'), Buffer.from(':0'),
]);
const probeHmac = createHmac('sha256', probeKey).update(probeMsg).digest('hex');
check('5.3 probe HMAC', probeHmac === 'fffffff4ad282d590ec6b3b7539f5a75d9f5c00620affb53fc64ca5bac039d05');
check('5.3 chunk0 >= LIMIT', parseInt(probeHmac.slice(0, 8), 16) === 4294967284 && 4294967284 >= 4294967280);
check('5.3 plain mod 48 -> 4 (implemented)', computePosition(probeSeed, D) === 4);
const chunk1 = parseInt(probeHmac.slice(8, 16), 16);
check('5.3 rejection reading -> 41 (not implemented, spec arithmetic)', chunk1 === 2905091417 && chunk1 % 48 === 41);

// ---- Properties ----
check('RANGE = 48', RANGE === 48);
check('DRAW_HEX_CHARS = 8', DRAW_HEX_CHARS === 8);
check('PAYOUT_TABLE length 48', PAYOUT_TABLE.length === 48);
const tierCounts = new Map<number, number>();
for (const e of PAYOUT_TABLE) tierCounts.set(e.multiplier, (tierCounts.get(e.multiplier) ?? 0) + 1);
check('positions x multiplier = 48 per tier',
  [...tierCounts].every(([m, c]) => m * c === 48) && tierCounts.size === 6,
  JSON.stringify([...tierCounts]));
const colours: Record<number, string> = { 48: 'green', 24: 'red', 16: 'purple', 8: 'blue', 4: 'grey', 2: 'dark_blue' };
check('colour labels per INTERFACE', PAYOUT_TABLE.every((e) => colours[e.multiplier] === e.color));
check('getResult = PAYOUT_TABLE[position]', PAYOUT_TABLE.every((e, i) => getResult(i) === e));
let rangeErr = 0;
for (const bad of [-1, 48, 1.5]) { try { getResult(bad); } catch { rangeErr++; } }
check('getResult rejects out-of-range', rangeErr === 3);
check('positionFromDigest(00000000..) = 0', positionFromDigest('0'.repeat(64)) === 0);
check('positionFromDigest(ffffffff..) = 15', positionFromDigest('f'.repeat(64)) === 4294967295 % 48);
let inRange = true;
for (let i = 0; i < 20000; i++) {
  const p = positionFromDigest(randomBytes(32).toString('hex'));
  if (!Number.isInteger(p) || p < 0 || p > 47) { inRange = false; break; }
}
check('positionFromDigest in 0..47 on 20000 random digests', inRange);
let posInRange = true;
for (let i = 0; i < 2000; i++) {
  const p = computePosition(randomBytes(32).toString('hex'), randomBytes(48).toString('hex'));
  if (p < 0 || p > 47) { posInRange = false; break; }
}
check('computePosition in 0..47 on 2000 random seeds', posInRange);

// Bias report vs an independent count: residue k has floor((2^32 - 1 - k)/48) + 1 preimages.
const SPACE = 2n ** 32n;
const counts: bigint[] = [];
for (let k = 0n; k < 48n; k++) counts.push((SPACE - 1n - k) / 48n + 1n);
check('preimage counts sum to 2^32', counts.reduce((a, b) => a + b, 0n) === SPACE);
// |count/2^32 - 1/48| = |48*count - 2^32| / (48 * 2^32)
const devs = counts.map((c) => 48n * c - SPACE);
const maxDev = devs.reduce((a, d) => (d < 0n ? -d : d) > a ? (d < 0n ? -d : d) : a, 0n);
const favoured = devs.filter((d) => d > 0n).length;
const bias = moduloBias();
const expectedMax = Number(maxDev) / (48 * 2 ** 32);
check('moduloBias max matches count', Math.abs(bias.maxBiasPerPosition - expectedMax) < 1e-24,
  `${bias.maxBiasPerPosition}`);
check('moduloBias max = 2/3 * 2^-32 (spec 2.3)', Math.abs(bias.maxBiasPerPosition - (2 / 3) / 2 ** 32) < 1e-24);
check('moduloBias affectedPositions matches count', bias.affectedPositions === favoured, `${favoured}`);
check('favoured positions are 0..15 (spec 2.3)', devs.every((d, i) => (i < 16 ? d > 0n : d < 0n)));

// §2.3 per-coin return under plain mod 48
const rtpWant: Record<number, string> = {
  2: '0.999999996275', 4: '1.000000000000', 8: '1.000000007451',
  16: '1.000000007451', 24: '1.000000007451', 48: '1.000000007451',
};
for (const m of [2, 4, 8, 16, 24, 48]) {
  let c = 0n;
  PAYOUT_TABLE.forEach((e, i) => { if (e.multiplier === m) c += counts[i]; });
  const rtp = (Number(c) * m) / 2 ** 32;
  check(`2.3 RTP ${multToCoin(m)}`, rtp.toFixed(12) === rtpWant[m], rtp.toFixed(12));
}

return { pass, total, failed };
}

describe('Spec self-test — src/rng.ts against docs/ALGORITHM.md (clean-room rebuild)', function () {
  this.timeout(120_000);
  it(`all ${EXPECTED_CHECKS} spec vector and property checks pass`, () => {
    const r = runSelftest();
    assert.deepStrictEqual(r.failed, []);
    assert.strictEqual(r.total, EXPECTED_CHECKS);
    assert.strictEqual(r.pass, EXPECTED_CHECKS);
  });
});
