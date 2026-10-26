/**
 * ARTIFACTS OF RECORD — pinned.
 *
 * These files are shipped as evidence and their figures are quoted in the report, but until this
 * pin existed nothing hashed them: emptying, duplicating or shrinking any of them left the
 * verifier reporting PROVABLY FAIR — Full Pass, exit 0. A published artifact that nothing can
 * distinguish from a rewritten one is not evidence.
 *
 * Only files the verifier does NOT write are pinned here. `outputs/verification-results.json` is
 * the verifier's own output and is guarded differently — the reproduction gate in tests/verify.ts
 * compares the committed copy with each fresh run field by field at tolerance — because a hash
 * pin on a file the same run rewrites under PF_EMIT=1 would be stale the moment it was checked.
 *
 * `npm run simulate` and `npm run verify` write under outputs/run/ unless PF_EMIT=1, so a casual
 * run cannot invalidate a pin. Regenerating an artifact legitimately means `PF_EMIT=1`, then
 * re-pinning it here in the same change.
 *
 * Pins recomputed 2026-09-23 with `shasum -a 256` over the files in this repo. simulation-results.json
 * re-pinned the same day: `generatedAt` removed (a timestamp made the pin unreproducible) and the
 * per-stream position counts added (Step 14 recomputes from them); every other value is unchanged.
 *
 * drand-api-verification.json RE-PINNED 2026-09-26 (previous pin d9e3c13d…): its one run-metadata
 * field, `generatedAt` ("2026-04-23T12:43:14.168Z" — the time the drand API was queried, now recorded
 * in MANIFEST.md), was deleted with Node's JSON.parse / JSON.stringify(…, null, 2), the serializer
 * src/verify-drand-timing.js writes with, which round-trips the original bytes exactly; git diff shows
 * that one line removed and nothing else. The script no longer writes the field (profile CASTLE-27,
 * conformance C-04).
 *
 * rtp-convergence.html RE-PINNED 2026-09-28 (previous pin 44ee6f5f…): Chart.js 4.4.7 is inlined verbatim
 * (Mike's review F16) instead of loaded from cdn.jsdelivr.net/npm/chart.js@4 (a floating major, now pinned
 * exactly in package.json). Regenerated with `PF_EMIT=1 npm run simulate`; simulation-results.json came
 * back byte-identical (c91033bd…) and the html diff is the one <script> tag.
 *
 * simulation-results.json RE-PINNED 2026-10-23 (previous pin c91033bd…): Pass 2 raised from 1,000 to
 * 10,000 simulated beacon values per seed (src/sim-seeds.ts PASS2_NONCES, v1.3.0) and regenerated with
 * `PF_EMIT=1 npm run simulate`. Only pass2_casino_seeds.noncesPerSeed and .meanRTP changed; Pass 1 is
 * byte-identical and rtp-convergence.html came back byte-identical (e5b14d85…).
 */
export const ARTIFACT_PINS: Readonly<Record<string, string>> = Object.freeze({
  'drand-api-verification.json':
    'cd5554cecdc374480053e2262164b8db22313c9f487a2f73d0df1c4a98ff3f10',
  'rtp-convergence.html':
    'e5b14d856f95f97cf16a99cc06c55ac116246d1256cc655276a622fa41c44c0f',
  'simulation-results.json':
    '99336e4ac229c08b57042aa96f38efc2dd49f8d90f24433fb2547f316a59f193',
});
