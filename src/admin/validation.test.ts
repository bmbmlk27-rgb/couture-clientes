import { describe, expect, it } from 'vitest';
import { validateMatchInput } from './validation';

const base = { home: 1, away: 2, status: 'finished' as const, ft: [2, 1] as [number, number], ht: [1, 0] as [number, number] };

describe('validateMatchInput', () => {
  it('accepte un match valide', () => expect(validateMatchInput(base)).toBeNull());
  it('exige deux équipes distinctes', () => {
    expect(validateMatchInput({ ...base, away: '' })).toMatch(/deux équipes/);
    expect(validateMatchInput({ ...base, away: 1 })).toMatch(/elle-même/);
  });
  it('refuse une mi-temps supérieure au score final', () => {
    expect(validateMatchInput({ ...base, ht: [3, 0] })).toMatch(/mi-temps/);
  });
  it('ignore les scores pour un match à venir', () => {
    expect(validateMatchInput({ ...base, status: 'upcoming', ht: [9, 9] })).toBeNull();
  });
});
