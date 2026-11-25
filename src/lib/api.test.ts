import { describe, expect, it } from 'vitest';
import { extractMatches } from './api';

/** Extrait de la vraie réponse ChampsBySport (sportIds=85) reçue via le relais Cloudflare. */
const game = (id: number, a: string, b: string, extra: Record<string, unknown> = {}) => ({
  opponent1: { fullName: a, countryId: 53, opps: [{ id: 180069, name: a }] },
  opponent2: { fullName: b, countryId: 231, opps: [{ id: 251219, name: b }] },
  scores: { fullScore: '0-0', scoreOpp1: 0, scoreOpp2: 0, statusLineStr: 'Début dans 2 minutes' },
  nonStarted: true, id, mainGameId: id, startTs: 1795615500, kind: 1,
  ...extra,
});

const payload = {
  data: [{
    mainLigas: [
      { countryId: 225, gamesCount: 3, id: 2986291, name: 'FC 26. 5x5 Rush. Superligue' },
      { countryId: 53, gamesCount: 4, id: 3074685, name: "FC 26. Championnat d'Allemagne" },
      { countryId: 225, gamesCount: 1, id: 2812138, name: 'FC25. Penalty', games: [game(774047882, 'Bayern Munich', 'Arsenal')] },
      { countryId: 225, gamesCount: 1, id: 2952096, name: 'FC26. Penalty', games: [
        game(774047900, 'Real Madrid', 'Juventus', { nonStarted: false, scores: { scoreOpp1: 3, scoreOpp2: 2 } }),
      ] },
      { countryId: 225, gamesCount: 1, id: 3000000, name: 'FC 26. Championnat d’Espagne', games: [game(1, 'Barcelone', 'Séville')] },
    ],
    gamesCount: 98,
    sport: { id: 85, name: 'FIFA' },
  }],
};

describe('extractMatches (Penalty)', () => {
  it('ne garde que les ligues Penalty', () => {
    const ms = extractMatches(payload);
    expect(ms.map((m) => m.league)).toEqual(['FC25. Penalty', 'FC26. Penalty']);
  });

  it('lit opponent1/opponent2, startTs, nonStarted et l’id Melbet', () => {
    const m = extractMatches(payload).find((x) => x.apiGameId === '774047882')!;
    expect(m.home.name).toBe('Bayern Munich');
    expect(m.home.short).toBe('FCB');
    expect(m.away.name).toBe('Arsenal');
    expect(m.status).toBe('upcoming');
    expect(m.startsAt).toBe(1795615500 * 1000);
    expect(m.liveScore).toBeUndefined();
  });

  it('match commencé : statut « live » et score en cours', () => {
    const m = extractMatches(payload).find((x) => x.apiGameId === '774047900')!;
    expect(m.status).toBe('live');
    expect(m.liveScore).toBe('3 - 2');
  });

  it('lit les cotes vainqueur présentes dans le nœud du match', () => {
    const [m] = extractMatches({ games: [{ I: 77, O1: 'A', O2: 'B', L: 'FC24. Penalty', E: [{ T: 1, C: 1.7 }, { T: 3, C: 2.1 }] }] });
    expect(m.odds).toEqual({ home: 1.7, away: 2.1 });
  });

  it('ignore une réponse sans match', () => {
    expect(extractMatches({ data: [] })).toEqual([]);
  });
});
