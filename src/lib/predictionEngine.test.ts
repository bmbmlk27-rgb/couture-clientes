import { describe, expect, it } from 'vitest';
import { calculateDoublePoisson } from './predictionEngine';

const h = (s: number[], c: number[]) => ({ goalsScored: s, goalsConceded: c });

describe('calculateDoublePoisson', () => {
  it('renvoie null sous 3 matchs d’historique', () => {
    expect(calculateDoublePoisson(h([1, 2], [0, 1]), h([1, 1, 1], [1, 1, 1]))).toBeNull();
  });

  it('favorise l’équipe dominante à domicile', () => {
    const p = calculateDoublePoisson(h([3, 2, 3, 2], [1, 0, 1, 0]), h([0, 1, 0, 1], [3, 2, 2, 3]))!;
    expect(p.winner).toBe('Domicile');
    const [a, b] = p.fullTimeScore.split(' - ').map(Number);
    expect(a).toBeGreaterThan(b);
    expect(p.confidence).toBeGreaterThan(50);
    expect(p.source).toBe('Double Poisson');
  });

  it('le score final est toujours cohérent avec le vainqueur', () => {
    const p = calculateDoublePoisson(h([0, 1, 0], [2, 2, 3]), h([3, 2, 2], [0, 1, 0]))!;
    expect(p.winner).toBe('Extérieur');
    const [a, b] = p.fullTimeScore.split(' - ').map(Number);
    expect(b).toBeGreaterThan(a);
  });
});
