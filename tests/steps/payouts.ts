/**
 * Steps 7–10: Payout and game mechanics verification for Castle Roulette.
 *   7. Payout Math — amountWon correct for wins/losses
 *   8. Color-Position Mapping — winning coin matches position tier
 *   9. Captured effectiveEdge Field Consistency — effectiveEdge === 0 for all rounds (operator field check)
 *  10. Phase Coverage — 800 A + 200 B + 100 C = 1100
 */

import { getResult, PAYOUT_TABLE, RANGE } from '../../src/rng';
import type { VerifyContext, StepResult } from './context';

export function run(ctx: VerifyContext): StepResult[] {
  const results: StepResult[] = [];
  const { rounds, phaseA, phaseB, phaseC } = ctx;

  // Step 7: Payout Math
  {
    let correct = 0;
    let wrong = 0;
    const errors: string[] = [];
    for (const r of rounds) {
      const amount = Math.abs(parseFloat(r.result.amountCurrency));
      const won = parseFloat(r.result.amountWon);
      const multiplier = parseFloat(r.result.multiplier);

      if (r.result.isWin) {
        // Win: amountWon should = bet × multiplier (zero edge)
        const expected = amount * multiplier;
        if (Math.abs(won - expected) < 0.000001) {
          correct++;
        } else {
          wrong++;
          if (errors.length < 5) {
            errors.push(`round ${r.roundId}: expected ${expected.toFixed(6)}, got ${won}`);
          }
        }
      } else {
        // Loss: amountWon = 0
        if (won === 0 || r.result.amountWon === '0' || r.result.amountWon === '0.000000000000000000') {
          correct++;
        } else {
          wrong++;
          if (errors.length < 5) {
            errors.push(`round ${r.roundId}: loss but amountWon=${won}`);
          }
        }
      }
    }

    // Verify isWin consistency
    let isWinCorrect = 0;
    for (const r of rounds) {
      const posResult = getResult(r.result.position);
      const shouldWin = posResult.color === r.request.coin.replace('_', '_');
      // Map coin keys to color names
      const coinToColor: Record<string, string> = {
        two: 'dark_blue', four: 'grey', eight: 'blue',
        sixteen: 'purple', twenty_four: 'red', forty_eight: 'green',
      };
      const betColor = coinToColor[r.request.coin];
      const actuallyWins = posResult.color === betColor;
      if (r.result.isWin === actuallyWins) isWinCorrect++;
    }

    results.push({
      step: 7,
      name: 'Payout Math',
      status: wrong === 0 && isWinCorrect === rounds.length ? 'PASS' : 'FAIL',
      detail: wrong === 0
        ? `${correct}/${rounds.length} payouts verified — ${isWinCorrect}/${rounds.length} isWin flags correct`
        : `${wrong} payout errors: ${errors.join('; ')}`,
    });
  }

  // Step 8: Color-Position Mapping
  {
    let match = 0;
    let mismatch = 0;
    for (const r of rounds) {
      const expected = getResult(r.result.position);
      // winningCoin is the coin key (e.g., "two"), map to expected multiplier
      const coinToMult: Record<string, number> = {
        two: 2, four: 4, eight: 8, sixteen: 16, twenty_four: 24, forty_eight: 48,
      };
      const expectedMult = coinToMult[r.result.winningCoin];
      if (expected.multiplier === expectedMult) match++;
      else mismatch++;
    }
    results.push({
      step: 8,
      name: 'Color-Position Mapping',
      status: mismatch === 0 ? 'PASS' : 'FAIL',
      detail: `${match}/${rounds.length} — position maps to correct color/multiplier tier for all rounds`,
    });
  }

  // Step 9: Captured effectiveEdge Field Consistency
  {
    let zeroEdge = 0;
    let nonZero = 0;
    for (const r of rounds) {
      if (r.result.effectiveEdge === 0) zeroEdge++;
      else nonZero++;
    }
    results.push({
      step: 9,
      name: 'Captured effectiveEdge Field Consistency',
      status: nonZero === 0 ? 'PASS' : 'FAIL',
      detail: `${zeroEdge}/${rounds.length} rounds carry effectiveEdge = 0 (operator field consistent with Zero Edge); the independent zero-edge proof is the wheel construction in Step 13`,
    });
  }

  // Step 10: Phase Coverage
  {
    const phaseD = rounds.filter(r => r.phase === 'D');
    const phaseE = rounds.filter(r => r.phase === 'E');
    const ok = phaseA.length === 800 && phaseB.length === 200 && phaseC.length === 100 && phaseD.length === 100 && phaseE.length === 150;
    results.push({
      step: 10,
      name: 'Phase Coverage',
      status: ok ? 'PASS' : 'FAIL',
      detail: `Phase A: ${phaseA.length}/800, Phase B: ${phaseB.length}/200, Phase C: ${phaseC.length}/100, Phase D: ${phaseD.length}/100, Phase E: ${phaseE.length}/150 — total ${rounds.length}`,
    });
  }

  return results;
}
