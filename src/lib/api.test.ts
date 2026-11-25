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

  it('lit le format mobile v3 (opponent1/opponent2, startTs, nonStarted)', () => {
    const game = (id: number, a: string, b: string) => ({
      opponent1: { fullName: a, opps: [{ id: 1, name: a }] },
      opponent2: { fullName: b, opps: [{ id: 2, name: b }] },
      nonStarted: true, id, startTs: 1895615500,
    });
    const payload = {
      data: [{
        mainLigas: [
          { id: 3074685, name: "FC 26. Championnat d'Allemagne", gamesCount: 1, games: [game(774047883, 'Bayern Munich', 'Borussia Dortmund')] },
          { id: 2812138, name: 'FC25. Penalty', gamesCount: 1, games: [game(774047882, 'Bayern Munich', 'Arsenal')] },
          { id: 3088640, name: 'Allemagne. Bundesliga. Simulation', gamesCount: 3 },
        ],
      }],
    };
    const ms = extractMatches(payload);
    expect(ms).toHaveLength(1); // la ligue « Penalty » est écartée
    expect(ms[0].league).toBe("FC 26. Championnat d'Allemagne");
    expect(ms[0].away.name).toBe('Borussia Dortmund');
    expect(ms[0].status).toBe('upcoming');
    expect(ms[0].startsAt).toBe(1895615500 * 1000);
    expect(ms[0].apiGameId).toBe('774047883');
  });

  it('ignore une réponse sans match', () => {
    expect(extractMatches({ data: [] })).toEqual([]);
  });
});
