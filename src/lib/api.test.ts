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
    expect(m.odds).toEqual({ home: 1.6, away: 4.2 });
  });

  it('ignore une réponse sans match', () => {
    expect(extractMatches({ data: [] })).toEqual([]);
  });
});
