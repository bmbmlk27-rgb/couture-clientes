import { describe, expect, it } from 'vitest';
import { extractMatches } from './api';

describe('extractMatches', () => {
  it('lit la structure data[0].mainLigas[].games', () => {
    const payload = {
      data: [{
        mainLigas: [{
          name: "FC 26. Championnat d'Allemagne",
          games: [{ id: 1, O1: 'Bayern Munich', O2: 'Dortmund', S: 1890000000, E: [{ T: 1, C: 1.6 }, { T: 3, C: 4.2 }] }],
        }],
      }],
    };
    const [m] = extractMatches(payload);
    expect(m.league).toContain('Allemagne');
    expect(m.home.short).toBe('FCB');
    expect(m.away.name).toBe('Borussia Dortmund');
    expect(m.odds).toBeUndefined(); // 1X2 incomplet (pas de nul) → ignoré
    expect(m.apiGameId).toBe('1');
  });

  it('lit un 1X2 complet dans le nœud du match', () => {
    const [m] = extractMatches({ games: [{ I: 77, O1: 'A', O2: 'B', E: [{ T: 1, C: 2 }, { T: 2, C: 3.2 }, { T: 3, C: 3.5 }] }] });
    expect(m.odds).toEqual({ home: 2, draw: 3.2, away: 3.5 });
  });

  it('ignore une réponse sans match', () => {
    expect(extractMatches({ data: [] })).toEqual([]);
  });
});
