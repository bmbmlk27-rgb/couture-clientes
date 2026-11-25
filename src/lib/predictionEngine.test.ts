import { describe, expect, it } from 'vitest';
import { calculateDoublePoisson } from './predictionEngine';

const h = (s: number[], c: number[]) => ({ goalsScored: s, goalsConceded: c });
const score = (s: string) => s.split(' - ').map(Number);

describe('calculateDoublePoisson', () => {
  it('renvoie null sous 3 matchs d’historique', () => {
    expect(calculateDoublePoisson(h([1, 2], [0, 1]), h([1, 1, 1], [1, 1, 1]))).toBeNull();
  });

  it('normalise λ par la moyenne de la ligue', () => {
    // Équipes « moyennes » (marquent et encaissent avgLeagueGoals) → λ = avgLeagueGoals × facteur
    const avg = h([2, 3, 2, 3], [3, 2, 3, 2]); // moyenne 2.5
    const p = calculateDoublePoisson(avg, avg, 2.5)!;
    expect(p.lambdaHome).toBeCloseTo(2.75, 2);
    expect(p.lambdaAway).toBeCloseTo(2.25, 2);
    // Avec une moyenne de ligue plus haute, les mêmes équipes produisent moins de buts
    const q = calculateDoublePoisson(avg, avg, 5)!;
    expect(q.lambdaHome).toBeCloseTo(1.38, 2);
  });

  it('ne force plus le score : le score exact peut différer du vainqueur', () => {
    const avg = h([2, 3, 2, 3], [3, 2, 3, 2]);
    const p = calculateDoublePoisson(avg, avg)!;
    expect(p.winner).toBe('Domicile');
    expect(p.fullTimeScore).toBe('2 - 2'); // mode de la matrice, non corrigé
    expect(p.scoreMatchesWinner).toBe(false);
  });

  it('les probabilités 1/N/2 somment à 100 % et confidence = max', () => {
    const p = calculateDoublePoisson(h([3, 2, 3, 2], [1, 0, 1, 0]), h([0, 1, 0, 1], [3, 2, 2, 3]))!;
    const { home, draw, away } = p.probabilities;
    expect(home + draw + away).toBeCloseTo(100, 0);
    expect(p.confidence).toBe(Math.max(home, draw, away));
    expect(p.winner).toBe('Domicile');
    const [a, b] = score(p.fullTimeScore);
    expect(a).toBeGreaterThanOrEqual(b);
    expect(p.source).toBe('Double Poisson');
  });

  it('rejette une moyenne de ligue nulle', () => {
    const t = h([1, 1, 1], [1, 1, 1]);
    expect(() => calculateDoublePoisson(t, t, 0)).toThrow();
  });
});
