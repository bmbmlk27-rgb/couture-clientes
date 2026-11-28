import { describe, expect, it } from 'vitest';
import { KEEP_AFTER_START_MS, MAX_PER_LEAGUE, rememberMatches, type MatchMemory } from './matchMemory';
import type { Match } from './types';

const team = (name: string) => ({ name, short: name.slice(0, 3), colors: ['#000', '#fff'] as [string, string] });
const NOW = 1_800_000_000_000;
const mk = (id: string, leagueId: number, startsAt: number, extra: Partial<Match> = {}): Match => ({
  id, league: `L${leagueId}`, leagueId, kind: 'match', home: team('A'), away: team('B'),
  startsAt, status: startsAt > NOW ? 'upcoming' : 'live', ...extra,
});

describe('rememberMatches', () => {
  it('garde les matchs d’un championnat qui n’est plus détaillé', () => {
    const mem: MatchMemory = new Map();
    rememberMatches(mem, [mk('1', 10, NOW + 60_000)], NOW);
    const out = rememberMatches(mem, [mk('2', 20, NOW + 60_000)], NOW + 1000);
    expect(out.get(10)?.map((m) => [m.id, m.remembered])).toEqual([['1', true]]);
    expect(out.get(20)?.map((m) => [m.id, m.remembered])).toEqual([['2', false]]);
  });

  it('recalcule le statut et efface le score des matchs mémorisés', () => {
    const mem: MatchMemory = new Map();
    rememberMatches(mem, [mk('1', 10, NOW + 60_000, { liveScore: '1 - 0' })], NOW);
    const later = NOW + 2 * 60_000;
    expect(rememberMatches(mem, [], later).get(10)?.[0]).toMatchObject({ status: 'live', liveScore: undefined });
    const muchLater = NOW + 12 * 60_000;
    expect(rememberMatches(mem, [], muchLater).get(10)?.[0].status).toBe('finished');
  });

  it('oublie les matchs trop anciens', () => {
    const mem: MatchMemory = new Map();
    rememberMatches(mem, [mk('1', 10, NOW)], NOW);
    const out = rememberMatches(mem, [], NOW + KEEP_AFTER_START_MS + 1);
    expect(out.has(10)).toBe(false);
    expect(mem.has(10)).toBe(false);
  });

  it('garde les cotes connues si la nouvelle réponse n’en a pas', () => {
    const mem: MatchMemory = new Map();
    rememberMatches(mem, [mk('1', 10, NOW + 60_000, { odds: { home: 1.8, away: 2.1 } })], NOW);
    const out = rememberMatches(mem, [mk('1', 10, NOW + 60_000)], NOW + 1000);
    expect(out.get(10)?.[0].odds).toEqual({ home: 1.8, away: 2.1 });
  });

  it('plafonne le nombre de matchs par championnat', () => {
    const mem: MatchMemory = new Map();
    const many = Array.from({ length: MAX_PER_LEAGUE + 5 }, (_, i) => mk(String(i), 10, NOW + i * 60_000));
    expect(rememberMatches(mem, many, NOW).get(10)).toHaveLength(MAX_PER_LEAGUE);
  });
});
