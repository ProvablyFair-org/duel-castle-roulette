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
  commitmentBeforeDrand: number;  // ms: drandMs - betPlacedAt (positive = pre-commit)
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
  status: 'PASS' | 'FLAG' | 'FAIL';
  detail: string;
}

export interface InfoItem {
  label: string;
  detail: string;
}
