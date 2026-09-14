/**
 * ARTIFACTS OF RECORD — pinned.
 *
 * These files are shipped as evidence and their figures are quoted in the report, but until this
 * pin existed nothing hashed them: emptying, duplicating or shrinking any of them left the
 * verifier reporting PROVABLY FAIR — Full Pass, exit 0. A published artifact that nothing can
 * distinguish from a rewritten one is not evidence.
 *
 * Files this verifier REWRITES on every run are deliberately absent from this list — pinning one
 * would fail on the second run. That they are rewritten at all is a separate defect.
 *
 * Regenerating an artifact legitimately means re-pinning it here, in the same commit.
 */
export const ARTIFACT_PINS: Readonly<Record<string, string>> = Object.freeze({
  'drand-api-verification.json':
    '85f88302f6b60251d005955aac5cdd9a7712cbb31ae396d475b6dc3c3895f3d2',
  'rtp-convergence.html':
    '18dc338cdd3b7cad3782bc588b4c3d512d1cc88cc162b856b7a072abd68a9026',
  'simulation-results.json':
    '67773bd819981f4ef21e8e35f63e2cbabd8fdfc4c2d522accae4c0e0bab26241',
});
