import { describe, expect, it } from 'vitest';
import { findDbTeam, historyFromRows } from './db';

describe('historyFromRows', () => {
  it('calcule buts marqués / encaissés du point de vue de l’équipe', () => {
    const rows = [
      { home_team_id: 7, home_score: 3, away_score: 1 }, // 7 à domicile
      { home_team_id: 2, home_score: 0, away_score: 2 }, // 7 à l'extérieur
      { home_team_id: 7, home_score: null, away_score: null }, // ignoré
    ];
    expect(historyFromRows(7, rows)).toEqual({ goalsScored: [3, 2], goalsConceded: [1, 0] });
  });

  it('base vide → historique vide (pas de plantage)', () => {
    expect(historyFromRows(1, [])).toEqual({ goalsScored: [], goalsConceded: [] });
  });
});

describe('findDbTeam', () => {
  it('relie un nom API à l’équipe de la base via les alias', () => {
    const teams = [{ id: 1, name: 'Borussia Dortmund', logo_url: null }, { id: 2, name: 'Bayern Munich', logo_url: null }];
    expect(findDbTeam('Dortmund', teams)?.id).toBe(1);
    expect(findDbTeam('FC Bayern', teams)?.id).toBe(2);
    expect(findDbTeam('Inconnu FC', teams)).toBeUndefined();
  });
});
