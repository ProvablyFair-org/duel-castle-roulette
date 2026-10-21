# Module interface the audit package expects (written by the auditor, not from the casino)

Write `rng.ts` (TypeScript, strict, Node `crypto` only, no dependencies) exporting exactly these names.
Semantics come from ALGORITHM.md; this file only fixes names, types and the package's own conventions.
`drandSeed` = the drand value exactly as the casino publishes it per round (the spec says which field and encoding).
Where the spec leaves plain mod vs rejection open, implement what the spec says to implement for now.

```ts
export const RANGE: number;            // 48 wheel positions
// Indexed by position 0..47: the tier multiplier and the package's colour label for that tier.
// Colour labels (package convention): 48x 'green', 24x 'red', 16x 'purple', 8x 'blue', 4x 'grey', 2x 'dark_blue'.
export const PAYOUT_TABLE: Array<{ multiplier: number; color: string }>;
export const DRAW_HEX_CHARS: number;   // hex characters of the digest the position draw reads
// Position 0..47 from one HMAC digest given as hex.
export function positionFromDigest(hmacHex: string): number;
export function computePosition(serverSeed: string, drandSeed: string): number;
export function computePositionFromBuffer(keyBuffer: Buffer, drandSeed: string): number;   // key already decoded
export function getResult(position: number): { multiplier: number; color: string };       // = PAYOUT_TABLE[position]
export function verifyHash(serverSeed: string, serverSeedHash: string): boolean;
// Exact bias of the position draw as implemented: the largest |P(position) - 1/48| and how many positions are favoured.
export function moduloBias(): { maxBiasPerPosition: number; affectedPositions: number };
```
