import { describe, expect, it } from 'vitest';
import { predictPenalty, regulationOutcome, simulateShootout } from './penaltyEngine';

const total = (m: Map<string, number>) => [...m.values()].reduce((s, p) => s + p, 0);

describe('simulateShootout', () => {
  it('distribution complète : les probabilités somment à 1', () => {
    const r = simulateShootout(0.75, 0.7);
    expect(total(r.scores)).toBeCloseTo(1, 6);
    expect(r.homeWin + r.awayWin).toBeCloseTo(1, 6);
    expect(r.regulation.home + r.regulation.draw + r.regulation.away).toBeCloseTo(1, 9);
  });

  it('équipes identiques : 50/50 si on ignore l’avantage du premier tireur', () => {
    const r = simulateShootout(0.75, 0.75);
    expect(r.homeWin).toBeGreaterThan(0.45);
    expect(r.homeWin).toBeLessThan(0.55);
  });

  it('arrêt anticipé : 3-0 est un score final, 5-0 impossible', () => {
    const r = simulateShootout(0.9, 0.1);
    expect(r.scores.get('3-0')).toBeGreaterThan(0);
    expect(r.scores.get('5-0')).toBeUndefined();
    expect(r.scores.get('4-0')).toBeUndefined();
  });

  it('mort subite : scores à un but d’écart au-delà de 5', () => {
    const r = simulateShootout(0.8, 0.8);
    expect(r.scores.get('6-5')).toBeGreaterThan(0);
    expect(r.scores.get('7-5')).toBeUndefined();
  });

  it('regulationOutcome = issue réglementaire de simulateShootout', () => {
    const r = simulateShootout(0.82, 0.64);
    const [h, d, a] = regulationOutcome(0.82, 0.64);
    expect(h).toBeCloseTo(r.regulation.home, 10);
    expect(d).toBeCloseTo(r.regulation.draw, 10);
    expect(a).toBeCloseTo(r.regulation.away, 10);
  });

  it('cas extrêmes : 100 % de réussite partout → mort subite infinie gérée', () => {
    const r = simulateShootout(0.99, 0.99);
    expect(r.homeWin + r.awayWin).toBeCloseTo(1, 4);
  });
});

describe('predictPenalty', () => {
  it('sans cotes : pas de prédiction', () => {
    expect(predictPenalty(undefined)).toBeNull();
    expect(predictPenalty({ home: 1, away: 2 })).toBeNull();
  });

  it('2 issues : retrouve la probabilité du marché', () => {
    const p = predictPenalty({ home: 1.6, away: 2.3 })!;
    // implicite sans marge : (1/1.6) / (1/1.6 + 1/2.3) ≈ 59 %
    expect(p.market).toBe('12');
    expect(p.winner).toBe('home');
    expect(p.probabilities.home).toBeCloseTo(59, 0);
    expect(p.conversion.home).toBeGreaterThan(p.conversion.away);
    expect(p.topScores).toHaveLength(3);
    expect(p.topScores[0].probability).toBeGreaterThanOrEqual(p.topScores[1].probability);
  });

  it('1X2 : le nul est interprété comme égalité après 5 tirs', () => {
    const p = predictPenalty({ home: 2.2, draw: 4.0, away: 3.1 })!;
    expect(p.market).toBe('1X2');
    const total = 1 / 2.2 + 1 / 4 + 1 / 3.1;
    expect(p.suddenDeath).toBeCloseTo(((1 / 4) / total) * 100, 0);
    expect(p.winner).toBe('home');
  });

  it('calcul rapide', () => {
    const t0 = performance.now();
    predictPenalty({ home: 2.2, draw: 4.0, away: 3.1 });
    expect(performance.now() - t0).toBeLessThan(60);
  });
});
