import { describe, expect, it } from 'vitest';
import { mergeFixtures } from './fixtures';
import { resolveTeam } from '../data/teams';
import type { Match } from './types';

const T0 = Date.parse('2026-11-25T18:00:00Z');
const mk = (id: string, home: string, away: string, min: number, extra: Partial<Match> = {}): Match => ({
  id, league: 'FC 26', home: resolveTeam(home), away: resolveTeam(away), startsAt: T0 + min * 60000, status: 'upcoming', ...extra,
});

describe('mergeFixtures', () => {
  it('ajoute les matchs saisis absents de l’API et trie par date', () => {
    const r = mergeFixtures([mk('a1', 'Bayern Munich', 'RB Leipzig', 10)], [mk('db-1', 'FC Cologne', 'Hambourg SV', 0, { origin: 'database' })]);
    expect(r.map((m) => m.id)).toEqual(['db-1', 'a1']);
  });

  it('dédoublonne (alias + 30 min) et complète les cotes manquantes de l’API', () => {
    const odds = { home: 1.6, draw: 4, away: 5.2 };
    const r = mergeFixtures(
      [mk('a1', 'Bayern', 'Dortmund', 0)],
      [mk('db-1', 'Bayern Munich', 'Borussia Dortmund', 20, { origin: 'database', odds })],
    );
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('a1');
    expect(r[0].odds).toEqual(odds);
  });

  it('garde les cotes de l’API quand elles existent', () => {
    const api = { home: 1.7, draw: 3.8, away: 4.5 };
    const r = mergeFixtures([mk('a1', 'Bayern', 'Dortmund', 0, { odds: api })], [mk('db-1', 'Bayern', 'Dortmund', 0, { odds: { home: 2, draw: 3, away: 3 } })]);
    expect(r[0].odds).toEqual(api);
  });

  it('ne fusionne pas des matchs éloignés dans le temps ou inversés', () => {
    expect(mergeFixtures([mk('a1', 'Bayern', 'Dortmund', 0)], [mk('db-1', 'Bayern', 'Dortmund', 120)])).toHaveLength(2);
    expect(mergeFixtures([mk('a1', 'Bayern', 'Dortmund', 0)], [mk('db-1', 'Dortmund', 'Bayern', 0)])).toHaveLength(2);
  });
});
