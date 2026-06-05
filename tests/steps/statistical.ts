/**
 * Informational live-bet statistics (NOT scored — underpowered at n=1350).
 */

import { getResult, RANGE } from '../../src/rng';
import { chiSquaredTest } from '../../src/stats';
import type { VerifyContext, InfoItem } from './context';

export function run(ctx: VerifyContext): InfoItem[] {
  const info: InfoItem[] = [];
  const { rounds } = ctx;

  // Position distribution chi-squared (informational)
  {
    const observed = new Array(RANGE).fill(0);
    for (const r of rounds) observed[r.result.position]++;
    const expected = new Array(RANGE).fill(rounds.length / RANGE);
    const result = chiSquaredTest(observed, expected);
    info.push({
      label: 'Position Distribution (chi-squared, 48 bins)',
      detail: `chi2=${result.chi2.toFixed(2)}, df=${result.df}, p=${result.pValue.toFixed(4)} — informational (simulation is authoritative)`,
    });
  }

  // Win rate per color
  {
    const coinToMult: Record<string, number> = {
      two: 2, four: 4, eight: 8, sixteen: 16, twenty_four: 24, forty_eight: 48,
    };
    const coinToSlots: Record<string, number> = {
      two: 24, four: 12, eight: 6, sixteen: 3, twenty_four: 2, forty_eight: 1,
    };
    const byCoin = new Map<string, { bets: number; wins: number; wagered: number; returned: number }>();
    for (const r of rounds) {
      const coin = r.request.coin;
      const entry = byCoin.get(coin) || { bets: 0, wins: 0, wagered: 0, returned: 0 };
      entry.bets++;
      const amt = Math.abs(parseFloat(r.result.amountCurrency));
      entry.wagered += amt;
      if (r.result.isWin) {
        entry.wins++;
        entry.returned += parseFloat(r.result.amountWon);
      }
      byCoin.set(coin, entry);
    }

    for (const [coin, data] of [...byCoin.entries()].sort((a, b) => (coinToMult[a[0]] || 0) - (coinToMult[b[0]] || 0))) {
      const mult = coinToMult[coin] || 0;
      const expectedWinRate = (coinToSlots[coin] || 0) / RANGE;
      const actualWinRate = data.bets > 0 ? data.wins / data.bets : 0;
      const rtp = data.wagered > 0 ? data.returned / data.wagered : 0;
      info.push({
        label: `${coin} (${mult}×) — n=${data.bets}`,
        detail: `win rate: ${(actualWinRate * 100).toFixed(1)}% (expected ${(expectedWinRate * 100).toFixed(1)}%) | RTP: ${(rtp * 100).toFixed(1)}% — informational`,
      });
    }
  }

  // Overall RTP
  {
    let totalWagered = 0;
    let totalReturned = 0;
    for (const r of rounds) {
      totalWagered += Math.abs(parseFloat(r.result.amountCurrency));
      if (r.result.isWin) totalReturned += parseFloat(r.result.amountWon);
    }
    const overallRtp = totalWagered > 0 ? totalReturned / totalWagered : 0;
    info.push({
      label: 'Overall Empirical RTP',
      detail: `${(overallRtp * 100).toFixed(2)}% — theoretical 100.0% (zero edge). Informational only.`,
    });
  }

  return info;
}
