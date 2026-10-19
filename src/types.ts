/**
 * Duel.com Castle Roulette — type definitions.
 * Castle Roulette is multiplayer + drand-based: no client seed, no nonce.
 * Each round has its own server seed + drand beacon. The position (0-47)
 * is shared by all players. Players bet on colors (6 tiers).
 */

export type Phase = 'A' | 'B' | 'C' | 'D' | 'E';

export type CoinKey = 'two' | 'four' | 'eight' | 'sixteen' | 'twenty_four' | 'forty_eight';

export interface DrandTiming {
  drandPublishedAt: number;       // unix seconds (drand chain formula)
  drandPublishedAtISO: string;
  commitmentBeforeDrand: number;  // ms: drandMs - betPlacedAt (positive = bet before beacon)
  betPlacedAt: number;            // unix ms (from transactions API)
  betPlacedAtISO: string;
  source: 'transactions-api' | 'capture-only';
}

export interface RouletteRound {
  at: string;
  phase: Phase;
  roundId: number;
  request: {
    amount: string;
    coin: CoinKey;
  };
  result: {
    position: number;             // 0-47
    winningCoin: CoinKey;
    serverSeed: string;
    serverSeedHash: string;
    drandRoundId: number;
    drandRandomness: string;      // 96-char hex BLS signature
    // effectiveEdge and isWin are written by the capture script, not served by Duel:
    // effectiveEdge is the literal 0 (not scored); isWin = (winningCoin === coin bet), checked for
    // consistency with the tier only (Step 7). Step 9 takes wins from the recomputed tier.
    effectiveEdge: number;
    isWin: boolean;
    betId: number;
    txId: number;
    multiplier: string;           // full precision e.g. "2.000000000000000000"
    amountCurrency: string;       // bet amount (negative)
    amountWon: string;            // payout amount
  };
  timing: DrandTiming;
}

export interface RouletteDataset {
  meta: {
    schema: string;
    createdAt: string;
    completedAt: string;
    enrichment: {
      totalRounds: number;
      enriched: number;
      missing: number;
      drandRoundMissing: number;
      preCommitViolations: number;
    };
  };
  rounds: RouletteRound[];
}

export interface StepResult {
  step: number;
  name: string;
  /** INFO: an informational step's deviation (profile policy INFORMATIONAL — the live-sample fit, Mike
   *  2026-09-29): reported, never counted as a flag, never affects the verdict. */
  status: 'PASS' | 'FLAG' | 'FAIL' | 'INFO';
  detail: string;
  /**
   * Machine-readable measurements for this step. A measured float belongs here and never
   * inside `detail`: the reproduction gate compares the committed artifact with a fresh run
   * field by field, and a string leaf can only be compared for equality — so a float
   * rendered into prose disagrees forever on any machine whose libm differs by a unit in
   * the last place, which is exactly the reader the gate exists for. `detail` states the
   * BOUND; `data` carries the measurement.
   */
  data?: Record<string, unknown>;
}

export interface InfoItem {
  label: string;
  detail: string;
}
