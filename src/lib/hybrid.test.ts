import { describe, expect, it } from 'vitest';
import { calculateDoublePoisson, calculateHybridPrediction, fitLambdasToOutcome } from './predictionEngine';

const h = (s: number[], c: number[]) => ({ goalsScored: s, goalsConceded: c });
const strongHome = h([3, 2, 3, 2], [1, 0, 1, 0]);
const weakAway = h([0, 1, 0, 1], [3, 2, 2, 3]);
const empty = h([], []);

/** Probabilités 1/N/2 d'un modèle de Poisson (référence pour les tests). */
function poissonOutcome(lh: number, la: number) {
  const f = (k: number): number => (k <= 1 ? 1 : k * f(k - 1));
  const p = (k: number, l: number) => (l ** k * Math.exp(-l)) / f(k);
  let home = 0, draw = 0, away = 0;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const v = p(i, lh) * p(j, la);
    if (i > j) home += v; else if (i === j) draw += v; else away += v;
  }
  const t = home + draw + away;
  return { home: home / t, draw: draw / t, away: away / t };
}

describe('calculateHybridPrediction — avec cotes', () => {
  it('se base sur les cotes et retire la marge du bookmaker', () => {
    const p = calculateHybridPrediction({ home: 1.5, draw: 4.2, away: 6.5 }, empty, empty)!;
    expect(p.basis).toBe('odds');
    expect(p.source).toBe('Cotes 1X2 + Poisson');
    // 1/1.5 + 1/4.2 + 1/6.5 = 1.0586 → marge 5.9 %
    expect(p.bookmakerMargin).toBeCloseTo(5.9, 1);
    const { home, draw, away } = p.probabilities;
    expect(home + draw + away).toBeCloseTo(100, 0);
    expect(home).toBeCloseTo((1 / 1.5 / 1.0586) * 100, 0);
    expect(p.winner).toBe('Domicile');
    expect(p.confidence).toBe(home);
  });

  it('n’a pas besoin d’historique quand les cotes existent', () => {
    expect(calculateHybridPrediction({ home: 2.1, draw: 3.4, away: 3.3 }, empty, empty)).not.toBeNull();
  });

  it('les cotes priment sur l’historique (outsider favori du marché)', () => {
    // L'historique donne Domicile, le marché donne Extérieur
    const p = calculateHybridPrediction({ home: 5.0, draw: 4.0, away: 1.6 }, strongHome, weakAway)!;
    expect(p.winner).toBe('Extérieur');
    const [a, b] = p.fullTimeScore.split(' - ').map(Number);
    expect(b).toBeGreaterThanOrEqual(a);
  });

  it('retrouve les λ qui ont généré des cotes sans marge', () => {
    const o = poissonOutcome(1.8, 0.9);
    const fit = fitLambdasToOutcome(o);
    expect(fit.lambdaHome).toBeCloseTo(1.8, 1);
    expect(fit.lambdaAway).toBeCloseTo(0.9, 1);
    const p = calculateHybridPrediction({ home: 1 / o.home, draw: 1 / o.draw, away: 1 / o.away }, empty, empty)!;
    expect(p.bookmakerMargin).toBeCloseTo(0, 1);
    expect(p.fullTimeScore).toBe('1 - 0'); // mode de Poisson(1.8) × Poisson(0.9)
  });

  it('un marché équilibré donne un nul probable et des λ proches', () => {
    const p = calculateHybridPrediction({ home: 2.6, draw: 3.1, away: 2.6 }, empty, empty)!;
    expect(Math.abs(p.lambdaHome - p.lambdaAway)).toBeLessThan(0.05);
    const [a, b] = p.fullTimeScore.split(' - ').map(Number);
    expect(a).toBe(b);
  });
});

describe('calculateHybridPrediction — sans cotes', () => {
  it('bascule sur le Double Poisson de l’historique', () => {
    const p = calculateHybridPrediction(undefined, strongHome, weakAway)!;
    expect(p.basis).toBe('history');
    expect(p.source).toBe('Double Poisson');
    expect(p.bookmakerMargin).toBeUndefined();
    expect(p).toEqual(calculateDoublePoisson(strongHome, weakAway));
  });

  it('ignore des cotes incomplètes ou invalides', () => {
    for (const odds of [{ home: 1.8, draw: 3.5 }, { home: 1.8, draw: 3.5, away: 0.9 }, { home: NaN, draw: 3, away: 3 }, null]) {
      expect(calculateHybridPrediction(odds, strongHome, weakAway)?.basis).toBe('history');
    }
  });

  it('renvoie null sans cotes ni historique suffisant', () => {
    expect(calculateHybridPrediction(null, h([1, 2], [0, 1]), weakAway)).toBeNull();
  });
});
