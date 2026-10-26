/**
 * Which ProvablyFair.org Castle Roulette profile check each scored step implements.
 *
 * The profile (`_workspace/pf-audit-framework/games/castle-roulette/profile.json`, CASTLE-01 …
 * CASTLE-30, 1.0.2 — approved 2026-10-14, Methodology v1.1 D6) declares the checks; this
 * suite scores 19 steps under its own numbering. The mapping is emitted into
 * `outputs/verification-results.json` beside the step results and read back by `pf-audit matrix`.
 *
 * THIS FILE LABELS; IT DOES NOT CHECK. A check is claimed only where the step's assertion decides the
 * profile's `asserts` text, read from the CURRENT step code (2026-09-26).
 *
 * COVERAGE DESCRIBES THE PACKAGE, NOT THE STEP: `full` = nothing the profile requires is unimplemented
 * (split checks: each note names its half); `partial` = something is implemented nowhere, named.
 */

export type Coverage = 'full' | 'partial';
export interface CheckClaim { id: string; coverage: Coverage; note?: string }
export interface StepClaims { claims: CheckClaim[]; reason?: string }

export const PROFILE_GAME = 'castle-roulette';
export const PROFILE_VERSION = '1.0.2';

const BEACON_GAP = 'PARTIAL for one conjunct: CASTLE-17 also asks that the server-seed commitment be shown before the '
  + 'beacon is published. The capture keeps serverSeedHash only in the result record, with no receipt time (the stored '
  + 'hash may come from the rolling, roll or end message or from the transactions API, and the dataset does not record '
  + 'which), so it holds no timed pre-round observation of the commitment. "The seed was fixed before the beacon" is '
  + 'premise P6 (ASSUMED): Step 2 times the bet against the beacon on the operator\'s transactions-API clock, not the '
  + 'seed. The Step 1 hash match is a consistency check and does not time the commitment; evidence/E02 (a panel '
  + 'screenshot of settled round 538305, which is not in the dataset) is illustrative only — a capture-origin gap, '
  + 'disclosed as MANIFEST DL-3, never an operator finding';

export const STEP_CLAIMS: Record<number, StepClaims> = {
  1: { claims: [{
    id: 'CASTLE-01', coverage: 'full',
    note: 'SHA-256(hex_decode(serverSeed)) === serverSeedHash on every round; the count opened is bound to EXPECTED_ROUNDS = '
      + '1,350 (src/loader.ts), an unopened commitment is counted and FAILs',
  }] },
  2: { claims: [{
    id: 'CASTLE-17', coverage: 'partial',
    note: 'timing half: for all 1,350 rounds the bet was accepted strictly before the drand round was published, the margin '
      + 'recomputed from drandPublishedAt × 1000 − betPlacedAt (server-side transactions-API timestamp, bound to '
      + 'EXPECTED_ROUNDS_WITH_SERVER_TIMESTAMP) and the stored margin required to equal it exactly. ' + BEACON_GAP,
  }] },
  3: { claims: [{
    id: 'CASTLE-17', coverage: 'partial',
    note: 'ordering half: drand round ids strictly increasing across all 1,349 transitions (bound to '
      + 'EXPECTED_DRAND_TRANSITIONS): no beacon round reused or out of order. Ordering only: it does not show that the '
      + 'server could not choose which later beacon a round uses, and advance beacon selection was not verified. '
      + BEACON_GAP,
  }] },
  4: { claims: [{
    id: 'CASTLE-05', coverage: 'full',
    note: 'seed half: the epoch is ONE round (declared nonce.epochSize = 1) — 1,350 distinct server seeds and 1,350 distinct '
      + 'commitment hashes against EXPECTED_DISTINCT_SEEDS, so no two rounds share a seed; per-phase counts are Step 10',
  }] },
  5: { claims: [
    { id: 'CASTLE-07', coverage: 'full',
      note: 'every round recomputed from (serverSeed, drandRandomness) to its served position, bound to EXPECTED_ROUNDS = 1,350; '
        + 'a mismatch or a short count FAILs' },
    { id: 'CASTLE-08', coverage: 'full',
      note: 'added 2026-09-26 (rule R1, integer draw): the draw is one uint32 reduced by a plain % 48 with NO rejection, so it is '
        + 'not exactly uniform — 2^32 = 48 × 89,478,485 + 16, positions 0–15 carry one extra value. The bound is computed from '
        + 'the domain src/rng.ts positionFromDigest actually reads (src/bias.ts; DRAW_HEX_CHARS = 8, confirmed by ~300 probes built so a '
        + 'wider or narrower read disagrees): per-position absolute bias 1.552e-10, at or under the 2^-32 = 2.328e-10 ceiling '
        + '(relative 1.118e-8); largest per-tier EV effect 7.451e-9 (Green, player-favourable), printed with every tier in the '
        + 'data block and disclosed as MANIFEST DL-2. HARD FAIL above the ceiling. FAIL probed (the read narrowed to 6 hex '
        + 'characters, a 24-bit draw)' },
    { id: 'CASTLE-24', coverage: 'full',
      note: 'added 2026-09-26: the ProvablyFair.org docs-site VerifyBets games/castle-roulette/derive.js + lib/hmac-sha256.js, read '
        + 'with `git cat-file -p origin/main:<path>` from mikepforg/pf-audit-duel origin/main @ bd4d59c (derive.js last changed '
        + '4aaa1b2, 2026-06-07), vendored under verifier-parity/, pinned in src/site-verifier.ts (derive.js 44f821b5…, '
        + 'hmac-sha256.js bc30bfe9…); Step 5 FAILs unless the copies hash to the pins, then EXECUTES the site\'s '
        + 'deriveCastleRouletteSync on all 1,350 rounds and requires position, colour and multiplier to agree with src/rng.ts '
        + 'and the served winning tier, and its PAYOUT_TABLE to equal src/rng.ts entry for entry. FAIL probed (derive.js '
        + 'reduction changed and re-pinned; a byte changed without re-pin). The live page is a separate build, not checked' },
  ] },
  6: { claims: [{
    id: 'CASTLE-12', coverage: 'full',
    note: 'Phase C = 100 rounds at $1 (100× the $0.01 base) backing coin "two", the same coin Phase A backs at base stake; '
      + 'all 100 recompute (bound to EXPECTED_PHASE_ROUNDS.C) and pay by the same table on the 2-dp grid (Step 7). Note for '
      + 'C-08: Phase B backs all six coins, so Phase C does not run the Phase B board; the stake-only comparison is Phase C '
      + 'vs Phase A',
  }] },
  7: { claims: [
    { id: 'CASTLE-11', coverage: 'full',
      note: 'every one of the 1,350 settlements on the 2-dp money grid in exact integer units: the stake must be a legal '
        + 'amount, a win must credit stake × multiplier to the unit, a loss exactly 0 units; a credit off the grid FAILs '
        + '(measured 2026-09-26: 0 of the 4,050 amountWon / amountCurrency / multiplier values off the grid)' },
    { id: 'CASTLE-10', coverage: 'full',
      note: 'win-rule half: isWin is capture-recorded (the capture script computes it from the served winningCoin and the coin '
        + 'bet), so it is checked for consistency only: it must equal (backed coin\'s colour == colour of the position) on all '
        + '1,350 rounds; the position used is the served one, which Steps 5 and 8 require to equal the recomputation. Step 9 '
        + 'takes wins from the recomputed tier, never from isWin' },
  ] },
  8: { claims: [
    { id: 'CASTLE-10', coverage: 'full',
      note: 'mapping half (hardened 2026-09-26): the RECOMPUTED position must equal the served one and the served winningCoin '
        + 'must name the table tier at it, on all 1,350 rounds' },
    { id: 'CASTLE-13', coverage: 'full',
      note: 'hardened 2026-09-26: the served 18-dp `multiplier` string must equal the declared table\'s multiplier at the '
        + 'recomputed position EXACTLY (parsed as an exact decimal, no tolerance) on every round; the table\'s origin is '
        + 'declared (src/rng.ts PAYOUT_TABLE, rebuilt from docs/ALGORITHM.md §3.1: Duel\'s game-page tiers and the live rounds) and matched against the site '
        + 'verifier\'s table in Step 5. FAIL probed (one served multiplier changed, dataset re-pinned)' },
    { id: 'CASTLE-14', coverage: 'full',
      note: 'served half: every served multiplier is a declared tier value at its position; the tier identity (count × '
        + 'multiplier = 48) is Step 13; no max-odds cap is declared, so the cap half is n/a (48× is the table maximum)' },
  ] },
  9: { claims: [{
    id: 'CASTLE-19', coverage: 'full',
    note: 'operator half (rebased 2026-10-04): served credit = stake × table multiplier exactly at 18 dp on all 473 winning '
      + 'rounds (wins from the recomputed tier, bound to EXPECTED_WINNING_ROUNDS), i.e. zero settlement edge derived from the '
      + 'served amountWon and amountCurrency; effectiveEdge is capture-recorded (a literal 0 written by the capture script) '
      + 'and not scored. The derived per-tier half is Step 13. FAIL probed (M09: one win credited at a 0.1% edge)',
  }] },
  10: { claims: [{
    id: 'CASTLE-05', coverage: 'full',
    note: 'phase half: 1,350 rounds and A 800 / B 200 / C 100 / D 100 / E 150 against src/loader.ts, not the dataset header',
  }] },
  11: { claims: [{
    id: 'CASTLE-26', coverage: 'full',
    note: 'SHA-256 of the dataset against the pin in src/loader.ts:7; an unset or mismatched pin is a HARD FAIL scored here '
      + '(the pre-flight does not exit early, so the FAIL branch is reachable)',
  }] },
  12: { claims: [{
    id: 'CASTLE-17', coverage: 'partial',
    note: 'chain-formula half: drandPublishedAt = genesis + (round − 1) × 3 s (quicknet) on all 1,350 rounds. ' + BEACON_GAP,
  }] },
  13: { claims: [
    { id: 'CASTLE-18', coverage: 'full',
      note: 'P(tier) from the count of uint32 values mapped to each position (89,478,486 or 89,478,485 of 2^32), no operator '
        + 'field; P × multiplier = 1 within RANGE/2^32 on every tier and the 48 probabilities sum to 1; since 2026-09-26 a '
        + 'NEGATIVE CONTROL (each tier\'s multiplier + 1 in turn) must be rejected on all 6 tiers. FAIL branch probed (the corruption removed from the control, so the unmodified table is offered as the corrupted one — Step 13 FAILs)' },
    { id: 'CASTLE-19', coverage: 'full',
      note: 'derived half: per-tier EV from the exact position probabilities, compared with the 0 % claim; the largest '
        + 'departure (Green, +7.451e-9) is exactly the draw-bias effect disclosed under CASTLE-08, so nothing is FLAGged' },
    { id: 'CASTLE-14', coverage: 'full',
      note: 'tier-identity half: every tier\'s positions × multiplier = 48 (the 100% baseline construction), asserted through P × '
        + 'multiplier = 1 on the exact counts' },
  ] },
  14: { claims: [{
    id: 'CASTLE-20', coverage: 'full',
    note: '10 streams × 500,000 = 5,000,000 rounds on pinned seeds and beacon values (src/sim-seeds.ts; the wheel is one '
      + 'configuration); every stream\'s 48-cell chi-squared, df, p, RTP and Fisher\'s combination RECOMPUTED from the '
      + 'per-stream counts the artifact ships; since 2026-09-26 ALL 10 streams — the full 5,000,000-position sequence — are '
      + 'replayed from src/sim-seeds.ts on every run (was: stream 0 only), every stream\'s counts must equal the artifact\'s, '
      + 'and lag1R / lag1Z / lag1P, runsZ / runsP and all 9 convergence points (marks moved to src/sim-seeds.ts, values '
      + 'unchanged) are recomputed from that sequence and compared with the artifact at the reproduction tolerance. Adds '
      + '≈30 s to every verify run. FAIL probed (M14b: lag1R forged and re-pinned; M14c: a convergence point forged and '
      + 're-pinned)',
  }] },
  15: { claims: [{
    id: 'CASTLE-21', coverage: 'partial',
    note: 'what IS asserted: all 1,350 revealed server seeds × 10,000 simulated beacon values (derived from MASTER_SEED in src/sim-seeds.ts; since 2026-10-23, '
      + 'was 1,000, which are kept unchanged as each seed\'s first 1,000) REPLAYED in full each run; per-seed 48-cell '
      + 'chi-squared at α = 0.01, failures against a pre-registered 3σ threshold; artifact scalars compared with the replay; '
      + 'FAILs below the framework floor of 10,000 values per seed (FAIL probed, M15b). PARTIAL: the null is a count '
      + 'threshold, not an exact or bootstrap null; no detection power printed',
  }] },
  16: { claims: [{
    id: 'CASTLE-17', coverage: 'partial',
    note: 'public-value half: 1,350/1,350 rows of the pinned outputs/drand-api-verification.json recounted and bound to the '
      + 'dataset — each row\'s API signature equals the dataset\'s drandRandomness for the same round and drand round id '
      + '(string equality against drand.cloudflare.com, NOT a BLS verification). ' + BEACON_GAP,
  }] },
  17: { claims: [{
    id: 'CASTLE-15', coverage: 'full',
    note: 'all 6 coin tiers ≥ MIN_ROUNDS_PER_COIN_TIER = 30 and no undeclared tier; 48/48 wheel positions landed; the return '
      + 'carried by never-landed positions measured (0 here) and each tier\'s expectation re-measured from the modulo mapping',
  }] },
  18: { claims: [{
    id: 'CASTLE-27', coverage: 'full',
    note: 'drand-api-verification.json, rtp-convergence.html and simulation-results.json hash-checked against '
      + 'src/artifact-pins.ts (absent or altered FAILs), each un-ignored by name in .gitignore; verify writes only to '
      + 'outputs/run/ unless PF_EMIT=1; no artifact of record carries run metadata (drand-api-verification.json lost '
      + 'generatedAt and was re-pinned; verification-results.json lost generatedAt); and — added 2026-09-26, ported from '
      + 'Duel Crash/Dice — every numeric leaf of the two committed JSON artifacts (3,268 leaves) is validated against a value '
      + 'domain in src/domains.ts (bounds from src/loader.ts, src/sim-seeds.ts and src/rng.ts, never from the artifact) in '
      + 'both directions: inside its domain, and covered by a rule. verification-results.json is the verifier\'s own output '
      + 'and is bound by the reproduction gate, not a pin (as Duel Crash). FAIL probed (M18b: an impossible chi-squared fail '
      + 'count written and re-pinned)',
  }] },
  19: { claims: [{
    id: 'CASTLE-22', coverage: 'full',
    note: 'added 2026-09-26, informational (a deviation is INFO — reported, never counted, verdict unchanged; profile '
      + 'policy INFORMATIONAL, Mike 2026-09-29): the 1,350 served wheel positions against the 48-position wheel under '
      + 'the exact reduction probabilities (uint32 % 48: positions 0–15 carry one extra value of 2^32), χ² df 47, and the win '
      + 'rate of each of the 6 coin tiers against the binomial at the exact tier probability (two-sided exact); 7 tests at '
      + 'Bonferroni 0.01/7. Measured: all 7 above the bound (positions p = 0.865; smallest tier p = 0.252, `two`). INFO probed '
      + '(M19: every position folded onto 0–23)',
  }] },
};

export const NOT_APPLICABLE: Array<{ id: string; reason: string }> = [
  { id: 'CASTLE-02',
    reason: 'applies = { commitment.forwardCommitment.nextHashField notNull } is false — declared null: there is no seed '
      + 'rotation and no next-seed hash. declarationTruth measured 2026-09-26: no key matching /next/i on any record of '
      + 'data/castle-roulette-master-1350rounds.json. Round ordering is carried by the beacon instead (CASTLE-17, Step 3)' },
  { id: 'CASTLE-03',
    reason: 'applies = { nonce.epochSize gt 1 } is false — declared 1: each round has its own server seed. declarationTruth: '
      + 'Step 4 asserts 1,350 distinct seeds and hashes over 1,350 rounds' },
  { id: 'CASTLE-04',
    reason: 'applies = { nonce.epochSize gt 1 } is false — declared 1; the message is `${randomness}:0` with the nonce fixed '
      + 'at 0 (src/rng.ts) and no captured record carries a nonce field (key walk 2026-09-26, no /nonce/i key)' },
  { id: 'CASTLE-06',
    reason: 'applies = { rng.message.clientSeedInMessage eq true } is false — the message is the beacon value + ":0"; there '
      + 'is no client seed (key walk 2026-09-26: no /client/i key in the dataset). The unpredictable input is the public '
      + 'beacon, whose value the server cannot set (premise P4; CASTLE-17); which later beacon a round uses was not verified (Step 3)' },
  { id: 'CASTLE-16',
    reason: 'applies = { money.balanceField notNull } is false — declared null; key walk 2026-09-26: no /balance|wallet/i key '
      + 'in the dataset. The settlement credit is verified instead (Step 7)' },
];

export const PACKAGE_CHECKS: Array<{ id: string; artifact: string; coverage: Coverage | 'none'; note: string }> = [
  { id: 'CASTLE-09', artifact: 'docs/ALGORITHM.md + tests/castle-roulette/RngSpecTests.ts + tests/castle-roulette/CastleRouletteTests.ts (Second check block) + src/operator-verifier.ts + Step 5', coverage: 'full',
    note: 'REWRITTEN 2026-10-20 (v1.2.0). src/rng.ts is rebuilt from a written specification, docs/ALGORITHM.md '
      + '(framework games/castle-roulette/ALGORITHM.md, commit 2dbffe4), by an implementer who never opened Duel\'s code; Duel\'s '
      + 'published Verify-tab code is run as a second check, not used as the source. Through v1.1.0 src/rng.ts was a port of that '
      + 'code and cited 8 of its lines (OPERATOR_SOURCE_CITES); the port and the citation table are gone. Duel\'s Castle Roulette '
      + 'Verify-tab code, pasted by Paulo from duel.com Verify tab 2026-09-26, is vendored verbatim at '
      + 'evidence/verify-tab/duel-verify-tab-castle-roulette-2026-09-26.js (E09, SHA-256 c83dca21…, never edited) and pinned with its '
      + 'runner in src/operator-verifier.ts. The asserts: (1) "unit tests reproduce at least one captured round … against the '
      + 'operator\'s published algorithm" — the Second check block in tests/castle-roulette/CastleRouletteTests.ts EXECUTES the pinned '
      + 'file with only its two "User input values" filled in (serverSeed, drandSeed = the captured drandRandomness hex) on all 1,350 '
      + 'captured rounds: its value % 48 position equals the served position and src/rng.ts on 1,350/1,350; (2) "fixed vectors" — three '
      + 'vectors (27, 16, and the spec\'s §5.3 probe, whose first uint32 lies in the top 16 values of 2^32: plain % 48 gives 4, a '
      + 'rejection draw 41; the file returns 4, as src/rng.ts does) through the same file, returned and printed, and '
      + 'tests/castle-roulette/RngSpecTests.ts runs the spec\'s own vectors and properties against src/rng.ts (119/119); (3) "the adapter '
      + 'cites the operator source line it ports" — superseded for this package by the 20 Oct 2026 rule that RNG code is rebuilt from a '
      + 'written spec: nothing is ported, so no operator line is cited; docs/ALGORITHM.md §4 names the source of every step instead '
      + '(Duel\'s public pages, the standard construction, the drand beacon or the 1,350 live rounds). Step 5 runs the same execution in '
      + 'the verifier. The earlier unit tests stay (5 known-answer rounds, negative controls, full recompute, the 48-entry table). FAIL '
      + 'probed: M05e (a line of the file changed AND re-pinned), M05f (file byte, no re-pin), M05g (runner byte, no re-pin), M05h (runner '
      + 'forged AND re-pinned). Not established: that the Verify button, or Duel\'s server, runs exactly this code' },
  { id: 'CASTLE-23', artifact: 'MANIFEST.md#verification-results', coverage: 'full',
    note: 'restated 2026-09-26 as the framework rows S5-1 … S5-8 between S5-MATRIX markers, each tied to a scored step or '
      + 'marked n/a / Not tested with the reason; the package\'s former S1–S10 table follows as supplementary rows' },
  { id: 'CASTLE-25', artifact: 'MANIFEST.md#verify-a-bet', coverage: 'full',
    note: 'MANIFEST "Verify a bet" carries (since 2026-09-26) an ordered six-step paste-path '
      + 'in the declaration\'s field names (the Duel Dice DICE-25 pattern): (1) where the seed and beacon value are revealed '
      + '— the round\'s Provably Fair panel (E06) and any drand relay; (2) which fields to paste — result.serverSeed, '
      + 'result.serverSeedHash, result.drandRoundId, result.drandRandomness, request.coin and the served result.* fields; '
      + '(3) the commitment encoding SHA-256(hex_decode(serverSeed)) == serverSeedHash; (4) the beacon encoding (hex-decoded, '
      + 'read as UTF-8) and its publication time; (5) the reduction HMAC → leading uint32 % 48; (6) the 0-based position → tier '
      + 'table and the settlement' },
  { id: 'CASTLE-28', artifact: 'package.json + tests/verify.ts + MANIFEST.md#reproduce-the-audit', coverage: 'full',
    note: 'measured 2026-09-26 on a fresh `git clone` of ProvablyFair-org/pf-duel-workspace origin/main @ 79aa65b (games/castle-roulette '
      + 'at 8f13658), Node v22.23.1: npm ci exit 0; npm test exit 0 — 20 passing, 18/18 Full Pass, REPRODUCED, verification-results '
      + 'byte-identical; npm run test:full exit 0 in 47 s — simulation-results.json and rtp-convergence.html regenerated '
      + 'byte-identical. Re-run on a copy of exactly the files this round will commit — see MANIFEST. drand-api-verification.json '
      + 'is regenerated only by the network script (npm run timing), not by test:full' },
  { id: 'CASTLE-29', artifact: 'tests/mutations.json + scripts/mutate.mjs', coverage: 'full',
    note: 'added 2026-09-26 (runner ported from Duel Video Poker via Beef): 22 step-named mutations run in a disposable copy by '
      + '`npm run mutate` (300 s hard timeout per run), each with the marker of the guard that must fire; includes forgeries '
      + 'that edit a pinned artifact AND re-pin it (M14, M15, M16) and a site-verifier forgery re-pinned (M05c). Measured '
      + '2026-09-26: 22/22 killed, 18/18 scored steps covered; re-run after Step 19 and M14b/M14c/M18b/M19 were added: 26/26 killed, '
      + '19/19 scored steps covered; re-run after Duel\'s Verify-tab code was wired into Step 5 (M05e–M05i: operator file forged AND '
      + 're-pinned, file and runner edited without re-pin, runner forged AND re-pinned, a citation moved): 31/31 killed, 19/19 covered '
      + '(M05i, the moved citation, was retired on 2026-10-20 with the src/rng.ts citation table, leaving 30 entries); '
      + 're-run 2026-10-04 after M09 was replaced by a settlement-edge forgery (a win credited at a 0.1% edge) and the disposable copy '
      + 'was given outputs/rtp-claim-table.json (without it the copy\'s baseline was not green): 31/31 killed, 19/19 covered. A first draft of M12 edited src/loader.ts DRAND_PERIOD and '
      + 'SURVIVED — that constant is dead code (Step 12 uses its own QUICKNET_PERIOD in tests/steps/dataset.ts:13); M12 now '
      + 'forges a publication time. M15b added 2026-10-23 with the Pass 2 floor (Pass 2 cut to 1,000 values per seed in code '
      + 'and artifact, re-pinned; only the floor can reject it), 31 entries; the latest battery run is recorded in MANIFEST.md '
      + '(Reproduce the audit). No declared survivors' },
  { id: 'CASTLE-30', artifact: 'MANIFEST.md#limitations-and-trust + MANIFEST.md#evidence', coverage: 'full',
    note: 'MANIFEST.md carries (since 2026-09-26) the declared-limitations register DL-1 … DL-7 with measured magnitudes and '
      + 'the Load-Bearing Premises table with ASSUMED markers; MANIFEST Evidence numbers every exhibit E01–E09 with its role' },
];

export function profileCoverageBlock(): Record<string, unknown> {
  return { game: PROFILE_GAME, profileVersion: PROFILE_VERSION, notApplicable: NOT_APPLICABLE, packageChecks: PACKAGE_CHECKS };
}

export function labelFor(step: number): Record<string, unknown> {
  const entry = STEP_CLAIMS[step];
  if (!entry) return { profileIds: [], profileChecks: [], profileNote: 'no mapping declared for this step' };
  return entry.claims.length
    ? { profileIds: entry.claims.map(c => c.id), profileChecks: entry.claims }
    : { profileIds: [], profileChecks: [], profileNote: entry.reason ?? 'no reason given' };
}
