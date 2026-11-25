import { describe, expect, it } from 'vitest';
import { parseOddsInput, toDate, validateLogoUrl, validateMatchInput, type MatchInput } from './validation';

const NOW = new Date('2026-11-25T18:00:00').getTime();
const noOdds = { home: '', draw: '', away: '' };
const base: MatchInput = {
  home: 1, away: 2, status: 'finished', date: '2026-11-25', time: '17:00',
  ft: [2, 1], ht: [1, 0], odds: noOdds,
};
const upcoming: MatchInput = { ...base, status: 'upcoming', time: '19:30', ft: [0, 0], ht: [0, 0] };

describe('validateMatchInput — match terminé', () => {
  it('accepte un match valide', () => expect(validateMatchInput(base, NOW)).toBeNull());
  it('exige deux équipes distinctes', () => {
    expect(validateMatchInput({ ...base, away: '' }, NOW)).toMatch(/deux équipes/);
    expect(validateMatchInput({ ...base, away: 1 }, NOW)).toMatch(/elle-même/);
  });
  it('refuse une mi-temps supérieure au score final', () => {
    expect(validateMatchInput({ ...base, ht: [3, 0] }, NOW)).toMatch(/mi-temps/);
  });
});

describe('validateMatchInput — match à venir', () => {
  it('seuls équipes, date et heure sont obligatoires (scores ignorés)', () => {
    expect(validateMatchInput({ ...upcoming, ht: [9, 9] }, NOW)).toBeNull();
  });
  it('exige la date et l’heure', () => {
    expect(validateMatchInput({ ...upcoming, date: '' }, NOW)).toMatch(/date et l’heure/);
    expect(validateMatchInput({ ...upcoming, time: '' }, NOW)).toMatch(/date et l’heure/);
  });
  it('refuse une date passée (au-delà de 15 min de tolérance)', () => {
    expect(validateMatchInput({ ...upcoming, time: '17:50' }, NOW)).toBeNull();
    expect(validateMatchInput({ ...upcoming, time: '17:00' }, NOW)).toMatch(/passé/);
  });
  it('accepte des cotes complètes, refuse des cotes partielles ou ≤ 1', () => {
    expect(validateMatchInput({ ...upcoming, odds: { home: '1,85', draw: '3.6', away: '4.1' } }, NOW)).toBeNull();
    expect(validateMatchInput({ ...upcoming, odds: { home: '1.85', draw: '', away: '4.1' } }, NOW)).toMatch(/trois cotes/);
    expect(validateMatchInput({ ...upcoming, odds: { home: '1', draw: '3', away: '4' } }, NOW)).toMatch(/Cote invalide/);
  });
});

describe('helpers', () => {
  it('parseOddsInput accepte la virgule décimale', () => {
    expect(parseOddsInput({ home: ' 1,85', draw: '3.60', away: '4,1 ' })).toEqual({ odds: { home: 1.85, draw: 3.6, away: 4.1 } });
    expect(parseOddsInput(noOdds)).toEqual({ odds: null });
  });
  it('toDate refuse les formats invalides', () => {
    expect(toDate('2026-11-25', '19:30')?.getHours()).toBe(19);
    expect(toDate('25/11/2026', '19:30')).toBeNull();
  });
  it('validateLogoUrl n’accepte que http(s)', () => {
    expect(validateLogoUrl('')).toBeNull();
    expect(validateLogoUrl('https://cdn.example.com/a.png')).toBeNull();
    expect(validateLogoUrl('javascript:alert(1)')).toMatch(/https/);
  });
});
