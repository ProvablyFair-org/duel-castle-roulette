/**
 * Duel.com Castle Roulette — VALUE DOMAINS for every numeric leaf of the committed JSON artifacts of record
 * (`outputs/simulation-results.json`, `outputs/drand-api-verification.json`). Profile CASTLE-27.
 *
 * Ported from the Duel Crash package's src/domains.ts (itself ported from Duel Dice), 2026-09-26. The
 * SHA-256 pin (Step 18) proves the bytes have not moved since we pinned them; it cannot tell a genuine
 * figure from a physically impossible one that a forger wrote and re-pinned. Step 18 therefore also
 * validates every numeric leaf against a domain declared here, in BOTH directions: every leaf satisfies
 * its domain, and every leaf path is covered by a rule (a new, undeclared numeric field fails). Every
 * bound comes from src/ (src/loader.ts, src/sim-seeds.ts, src/rng.ts), NEVER from the artifact being
 * checked. The domains encode physical possibility, not plausibility.
 */

import { EXPECTED_ROUNDS, EXPECTED_DISTINCT_SEEDS, WHEEL_POSITIONS } from './loader';
import { PASS1_STREAMS, PASS1_ROUNDS_EACH, PASS1_ROUNDS_TOTAL, PASS2_NONCES } from './sim-seeds';
import { RANGE, PAYOUT_TABLE } from './rng';

export interface Domain {
  readonly label: string;
  readonly ok: (v: number) => boolean;
}

const D = (label: string, ok: (v: number) => boolean): Domain => ({ label, ok });

// ── Primitive domains ────────────────────────────────────────────────────────────────────────────

/** Any real number that is not NaN/Infinity. Used only where the quantity has no physical bound (z-scores). */
export const FINITE = D('a finite number', v => Number.isFinite(v));
export const NONNEG_REAL = D('a non-negative real', v => Number.isFinite(v) && v >= 0);
export const POSITIVE_INT = D('a positive integer', v => Number.isInteger(v) && v >= 1);
export const PROBABILITY = D('a probability in [0,1]', v => Number.isFinite(v) && v >= 0 && v <= 1);
export const CORRELATION = D('a correlation in [-1,1]', v => Number.isFinite(v) && v >= -1 && v <= 1);
/** A chi-squared statistic is a sum of squares over positive expectations. */
export const CHI_SQUARED = D('a non-negative chi-squared statistic', v => Number.isFinite(v) && v >= 0);

export const exactly = (target: number, what: string): Domain =>
  D(`exactly ${target} (${what})`, v => v === target);

export const intAtMost = (max: number, what: string): Domain =>
  D(`an integer in [0, ${max}] (${what})`, v => Number.isInteger(v) && v >= 0 && v <= max);

export const intBetween = (lo: number, hi: number, what: string): Domain =>
  D(`an integer in [${lo}, ${hi}] (${what})`, v => Number.isInteger(v) && v >= lo && v <= hi);

export const realBetween = (lo: number, hi: number, what: string): Domain =>
  D(`a real in [${lo}, ${hi}] (${what})`, v => Number.isFinite(v) && v >= lo && v <= hi);

export const oneOf = (set: readonly number[], what: string): Domain =>
  D(`one of {${set.join(', ')}} (${what})`, v => set.includes(v));

/** A computed identity held to double rounding: |v − target| ≤ 1e-12 (the value is a product of two doubles). */
export const identity = (target: number, what: string): Domain =>
  D(`${target} within 1e-12 (${what})`, v => Number.isFinite(v) && Math.abs(v - target) <= 1e-12);

// ── The rule table ────────────────────────────────────────────────────────────────────────────────

export interface Rule {
  /** Matches a COLLAPSED leaf path: array indices are rendered as `[]`. */
  readonly path: RegExp;
  readonly domain: Domain;
}

/** Collapse `a.b[3].c` to `a.b[].c` so one rule covers every element of a list. */
export function collapsePath(path: string): string {
  return path.replace(/\[\d+\]/g, '[]');
}

/**
 * Every numeric leaf of each committed artifact, with the domain it physically admits.
 * Ordering matters: the FIRST matching rule wins, so narrower (anchored) patterns come first.
 */
export function domainRules(): Record<string, Rule[]> {
  // Every round pays one of the table multipliers or nothing, so an average return per unit staked lies
  // in [0, the largest multiplier on the wheel].
  const maxMult = Math.max(...PAYOUT_TABLE.map(t => t.multiplier));
  const avgReturn = realBetween(0, maxMult, 'an attainable average return per unit staked');
  return {
    // ── outputs/simulation-results.json ────────────────────────────────────────────────────────────
    'simulation-results.json': [
      { path: /^\.pass1_fresh_seeds\.totalRounds$/, domain: exactly(PASS1_ROUNDS_TOTAL, 'PASS1_ROUNDS_TOTAL') },
      { path: /^\.pass1_fresh_seeds\.streams$/, domain: exactly(PASS1_STREAMS, 'PASS1_STREAMS') },
      { path: /^\.pass1_fresh_seeds\.roundsPerStream$/, domain: exactly(PASS1_ROUNDS_EACH, 'PASS1_ROUNDS_EACH') },
      { path: /^\.pass1_fresh_seeds\.streamResults\[\]\.stream$/, domain: intBetween(0, PASS1_STREAMS - 1, 'a stream index') },
      { path: /^\.pass1_fresh_seeds\.streamResults\[\]\.chi2$/, domain: CHI_SQUARED },
      { path: /^\.pass1_fresh_seeds\.streamResults\[\]\.df$/, domain: intBetween(1, RANGE - 1, 'wheel positions − 1 after pooling') },
      { path: /^\.pass1_fresh_seeds\.streamResults\[\]\.pValue$/, domain: PROBABILITY },
      { path: /^\.pass1_fresh_seeds\.streamResults\[\]\.rtp$/, domain: avgReturn },
      { path: /^\.pass1_fresh_seeds\.streamResults\[\]\.observed\[\]$/, domain: intAtMost(PASS1_ROUNDS_EACH, 'a per-position count within one stream') },
      { path: /^\.pass1_fresh_seeds\.fisherCombined\.statistic$/, domain: CHI_SQUARED },
      { path: /^\.pass1_fresh_seeds\.fisherCombined\.df$/, domain: exactly(2 * PASS1_STREAMS, '2 × streams') },
      { path: /^\.pass1_fresh_seeds\.fisherCombined\.pValue$/, domain: PROBABILITY },
      { path: /^\.pass1_fresh_seeds\.serialIndependenceFails$/, domain: intAtMost(1, 'one pooled serial test') },
      { path: /^\.pass1_fresh_seeds\.lag1R$/, domain: CORRELATION },
      { path: /^\.pass1_fresh_seeds\.lag1Z$/, domain: FINITE },
      { path: /^\.pass1_fresh_seeds\.lag1P$/, domain: PROBABILITY },
      { path: /^\.pass1_fresh_seeds\.runsZ$/, domain: FINITE },
      { path: /^\.pass1_fresh_seeds\.runsP$/, domain: PROBABILITY },
      { path: /^\.pass1_fresh_seeds\.simulatedRTP$/, domain: avgReturn },
      { path: /^\.pass1_fresh_seeds\.convergence\[\]\.rounds$/, domain: intBetween(1, PASS1_ROUNDS_TOTAL, 'a cumulative round mark') },
      { path: /^\.pass1_fresh_seeds\.convergence\[\]\.rtp$/, domain: avgReturn },
      { path: /^\.pass2_casino_seeds\.seedsTested$/, domain: exactly(EXPECTED_DISTINCT_SEEDS, 'EXPECTED_DISTINCT_SEEDS') },
      { path: /^\.pass2_casino_seeds\.noncesPerSeed$/, domain: exactly(PASS2_NONCES, 'PASS2_NONCES') },
      { path: /^\.pass2_casino_seeds\.chi2Fails$/, domain: intAtMost(EXPECTED_DISTINCT_SEEDS, 'a count of seeds') },
      { path: /^\.pass2_casino_seeds\.meanRTP$/, domain: avgReturn },
    ],

    // ── outputs/drand-api-verification.json ────────────────────────────────────────────────────────
    'drand-api-verification.json': [
      { path: /^\.totalRounds$/, domain: exactly(EXPECTED_ROUNDS, 'EXPECTED_ROUNDS') },
      { path: /^\.passed$/, domain: intAtMost(EXPECTED_ROUNDS, 'a count within the audited rounds') },
      { path: /^\.failed$/, domain: intAtMost(EXPECTED_ROUNDS, 'a count within the audited rounds') },
      { path: /^\.results\[\]\.roundId$/, domain: POSITIVE_INT },
      { path: /^\.results\[\]\.drandRoundId$/, domain: POSITIVE_INT },
    ],
  };
}

/** RANGE (src/rng.ts) and WHEEL_POSITIONS (src/loader.ts) are the same wheel; a disagreement is a src/ defect. */
if (RANGE !== WHEEL_POSITIONS) throw new Error(`src/rng.ts RANGE ${RANGE} != src/loader.ts WHEEL_POSITIONS ${WHEEL_POSITIONS}`);

export interface DomainViolation {
  path: string;
  value: number;
  expected: string;
}

/** Collect every numeric leaf of `doc` as `[collapsedPath, value]`. */
export function numericLeaves(doc: unknown, path = '', out: [string, number][] = []): [string, number][] {
  if (typeof doc === 'number') { out.push([collapsePath(path), doc]); return out; }
  if (doc === null || typeof doc !== 'object') return out;
  if (Array.isArray(doc)) {
    doc.forEach((v, i) => numericLeaves(v, `${path}[${i}]`, out));
    return out;
  }
  for (const [k, v] of Object.entries(doc as Record<string, unknown>)) numericLeaves(v, `${path}.${k}`, out);
  return out;
}

/**
 * Validate every numeric leaf of `doc` against `rules`. A leaf matched by NO rule is a violation in its
 * own right (`uncovered`): an unbounded new field is precisely how this class reopens.
 */
export function validateDomains(doc: unknown, rules: Rule[]): { violations: DomainViolation[]; uncovered: string[]; checked: number } {
  const violations: DomainViolation[] = [];
  const uncovered: string[] = [];
  const leaves = numericLeaves(doc);
  for (const [p, v] of leaves) {
    const rule = rules.find(r => r.path.test(p));
    if (!rule) {
      if (!uncovered.includes(p)) uncovered.push(p);
      continue;
    }
    if (!rule.domain.ok(v)) violations.push({ path: p, value: v, expected: rule.domain.label });
  }
  return { violations, uncovered, checked: leaves.length };
}

/** One-line summaries for a step's detail string. */
export function describeDomainFailures(artifact: string, r: { violations: DomainViolation[]; uncovered: string[] }): string[] {
  const out: string[] = [];
  for (const v of r.violations.slice(0, 4)) out.push(`${artifact}${v.path} = ${v.value} is not ${v.expected}`);
  if (r.violations.length > 4) out.push(`${artifact}: +${r.violations.length - 4} more impossible value(s)`);
  for (const p of r.uncovered.slice(0, 4)) out.push(`${artifact}${p} has no declared value domain (add one in src/domains.ts)`);
  if (r.uncovered.length > 4) out.push(`${artifact}: +${r.uncovered.length - 4} more undeclared field(s)`);
  return out;
}
