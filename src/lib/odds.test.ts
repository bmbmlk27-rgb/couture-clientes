import { describe, expect, it } from 'vitest';
import { extract1X2, impliedProbabilities, isCompleteOdds } from './odds';

describe('extract1X2', () => {
  it('format compact E[] avec groupe G=1', () => {
    const game = { Value: { E: [
      { G: 2, T: 7, C: 1.9 }, // handicap : ignoré
      { G: 1, T: 1, C: 1.85 }, { G: 1, T: 2, C: 3.6 }, { G: 1, T: 3, C: 4.1 },
    ] } };
    expect(extract1X2(game)).toEqual({ home: 1.85, draw: 3.6, away: 4.1 });
  });

  it('format groupé GE[{G:1, E:[[…],[…],[…]]}]', () => {
    const game = { Value: { GE: [
      { G: 17, E: [[{ T: 9, C: 1.7 }]] },
      { G: 1, E: [[{ T: 1, C: 2.05 }], [{ T: 2, C: 3.3 }], [{ T: 3, C: 3.45 }]] },
    ] } };
    expect(extract1X2(game)).toEqual({ home: 2.05, draw: 3.3, away: 3.45 });
  });

  it('clés longues et cotes en chaîne « 1,95 »', () => {
    const game = { data: { markets: [{ marketId: 1, events: [
      { type: 1, coef: '1,95' }, { type: 2, coef: '3.40' }, { type: 3, coef: 3.9 },
    ] }] } };
    expect(extract1X2(game)).toEqual({ home: 1.95, draw: 3.4, away: 3.9 });
  });

  it('renvoie null si le 1X2 est absent ou incomplet', () => {
    expect(extract1X2({ E: [{ G: 1, T: 1, C: 1.8 }, { G: 1, T: 3, C: 4 }] })).toBeNull();
    expect(extract1X2({ E: [{ G: 8, T: 1, C: 1.8 }, { G: 8, T: 2, C: 3 }, { G: 8, T: 3, C: 4 }] })).toBeNull();
    expect(extract1X2(null)).toBeNull();
  });
});

describe('impliedProbabilities / isCompleteOdds', () => {
  it('normalise et calcule la marge', () => {
    const p = impliedProbabilities({ home: 2, draw: 4, away: 4 }); // 0.5 + 0.25 + 0.25 = 1
    expect(p).toEqual({ home: 0.5, draw: 0.25, away: 0.25, margin: 0 });
  });
  it('valide les cotes', () => {
    expect(isCompleteOdds({ home: 1.5, draw: 4, away: 6 })).toBe(true);
    expect(isCompleteOdds({ home: 1, draw: 4, away: 6 })).toBe(false);
    expect(isCompleteOdds({ home: 1.5, draw: null, away: 6 })).toBe(false);
  });
});
