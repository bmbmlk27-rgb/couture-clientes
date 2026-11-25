import { describe, expect, it } from 'vitest';
import { fitLambdasToOutcome, predictMatch } from './matchEngine';

describe('predictMatch', () => {
  it('sans nul (2 issues) ou sans cotes : pas de prédiction', () => {
    expect(predictMatch(undefined)).toBeNull();
    expect(predictMatch({ home: 1.6, away: 2.3 })).toBeNull();
  });

  it('retrouve les probabilités du marché et un score cohérent', () => {
    const p = predictMatch({ home: 1.85, draw: 3.6, away: 4.1 })!;
    expect(p.winner).toBe('Domicile');
    expect(p.probabilities.home + p.probabilities.draw + p.probabilities.away).toBeCloseTo(100, 0);
    expect(p.lambdaHome).toBeGreaterThan(p.lambdaAway);
    expect(p.fullTimeScore).toMatch(/^\d+ - \d+$/);
  });

  it('format à beaucoup de buts (nul rare) : λ élevés', () => {
    const fit = fitLambdasToOutcome({ home: 0.47, draw: 0.12, away: 0.41 });
    expect(fit.lambdaHome + fit.lambdaAway).toBeGreaterThan(6);
    expect(fit.error).toBeLessThan(1e-4);
  });

  it('calcul rapide', () => {
    const t0 = performance.now();
    predictMatch({ home: 2.1, draw: 3.4, away: 3.3 });
    expect(performance.now() - t0).toBeLessThan(150);
  });
});

describe('formats à beaucoup de buts', () => {
  it('5x5 Rush (nul ≈ 10 %) : λ non bloqués par la borne', () => {
    const p = predictMatch({ home: 2.0, draw: 9.5, away: 2.3 })!;
    expect(p.lambdaHome).toBeLessThan(13.9);
    expect(p.probabilities.draw).toBeCloseTo((1 / 9.5) / (1 / 2 + 1 / 9.5 + 1 / 2.3) * 100, 0);
  });
});
