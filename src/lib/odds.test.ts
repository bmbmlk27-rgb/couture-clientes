import { describe, expect, it } from 'vitest';
import { extractOdds, impliedProbabilities, isValidOdds } from './odds';

describe('extractOdds', () => {
  it('format compact E[] avec groupe G=1', () => {
    const game = { Value: { E: [
      { G: 2, T: 7, C: 1.9 }, // handicap : ignoré
      { G: 1, T: 1, C: 1.85 }, { G: 1, T: 2, C: 3.6 }, { G: 1, T: 3, C: 4.1 },
    ] } };
    expect(extractOdds(game)).toEqual({ home: 1.85, draw: 3.6, away: 4.1 });
  });

  it('format groupé GE[{G:1, E:[[…],[…],[…]]}]', () => {
    const game = { Value: { GE: [
      { G: 17, E: [[{ T: 9, C: 1.7 }]] },
      { G: 1, E: [[{ T: 1, C: 2.05 }], [{ T: 2, C: 3.3 }], [{ T: 3, C: 3.45 }]] },
    ] } };
    expect(extractOdds(game)).toEqual({ home: 2.05, draw: 3.3, away: 3.45 });
  });

  it('clés longues et cotes en chaîne « 1,95 »', () => {
    const game = { data: { markets: [{ marketId: 1, events: [
      { type: 1, coef: '1,95' }, { type: 2, coef: '3.40' }, { type: 3, coef: 3.9 },
    ] }] } };
    expect(extractOdds(game)).toEqual({ home: 1.95, draw: 3.4, away: 3.9 });
  });

  it('marché à 2 issues : pas de nul', () => {
    expect(extractOdds({ E: [{ G: 1, T: 1, C: 1.8 }, { G: 1, T: 3, C: 4 }] })).toEqual({ home: 1.8, away: 4 });
  });

  it('renvoie null si le marché vainqueur est absent ou incomplet', () => {
    expect(extractOdds({ E: [{ G: 1, T: 1, C: 1.8 }, { G: 1, T: 2, C: 4 }] })).toBeNull();
    expect(extractOdds({ E: [{ G: 8, T: 1, C: 1.8 }, { G: 8, T: 2, C: 3 }, { G: 8, T: 3, C: 4 }] })).toBeNull();
    expect(extractOdds(null)).toBeNull();
  });
});

describe('impliedProbabilities / isValidOdds', () => {
  it('2 issues : draw = 0', () => {
    expect(impliedProbabilities({ home: 2, away: 2 })).toEqual({ home: 0.5, draw: 0, away: 0.5, margin: 0 });
  });
  it('normalise et calcule la marge', () => {
    const p = impliedProbabilities({ home: 2, draw: 4, away: 4 }); // 0.5 + 0.25 + 0.25 = 1
    expect(p).toEqual({ home: 0.5, draw: 0.25, away: 0.25, margin: 0 });
  });
  it('valide les cotes', () => {
    expect(isValidOdds({ home: 1.5, draw: 4, away: 6 })).toBe(true);
    expect(isValidOdds({ home: 1, draw: 4, away: 6 })).toBe(false);
    expect(isValidOdds({ home: 1.5, away: 6 })).toBe(true);
    expect(isValidOdds({ home: 1.5, draw: 1, away: 6 })).toBe(false);
  });
});
