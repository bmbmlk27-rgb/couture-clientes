import { useCallback, useEffect, useRef, useState } from 'react';
import { enrichWithOdds, fetchChampionships, fetchLeagueMatches } from '../lib/api';
import { predictPenalty, type PenaltyPrediction } from '../lib/penaltyEngine';
import { predictMatch, type MatchPrediction } from '../lib/matchEngine';
import type { Odds } from '../lib/odds';
import type { League, LeagueWithMatches, Match, MatchWithPrediction } from '../lib/types';

/** Les matchs virtuels durent quelques minutes : rafraîchissement fréquent. */
const REFRESH_MS = 30_000;
const LEAGUE_CONCURRENCY = 4;

/** Le calage ne dépend que des cotes : résultat gardé pour des cotes identiques. */
const cache = new Map<string, PenaltyPrediction | MatchPrediction | null>();
function cached<T extends PenaltyPrediction | MatchPrediction>(kind: string, odds: Odds | undefined, f: (o: Odds) => T | null): T | null {
  if (!odds) return null;
  const key = `${kind}|${odds.home}|${odds.draw ?? ''}|${odds.away}`;
  if (!cache.has(key)) {
    if (cache.size > 1000) cache.clear();
    cache.set(key, f(odds));
  }
  return cache.get(key) as T | null;
}

function withPrediction(m: Match): MatchWithPrediction {
  return m.kind === 'penalty'
    ? { ...m, penalty: cached('p', m.odds, predictPenalty), match: null }
    : { ...m, penalty: null, match: cached('m', m.odds, predictMatch) };
}

/** Exécute `f` sur chaque élément avec au plus `n` appels simultanés. */
async function pool<T>(items: T[], n: number, f: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await f(items[i++]);
  }));
}

export function useChampionships() {
  const [leagues, setLeagues] = useState<LeagueWithMatches[]>([]);
  const [apiError, setApiError] = useState<string | undefined>();
  const [latency, setLatency] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());
  const busy = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const api = await fetchChampionships();
      setApiError(api.error);
      setLatency(api.latencyMs);
      if (!api.leagues) return; // on garde le dernier affichage

      // 1. Matchs déjà détaillés dans ChampsBySport, puis ceux des autres championnats.
      const byLeague = new Map<number, Match[]>();
      for (const m of api.matches) {
        if (m.leagueId !== undefined) byLeague.set(m.leagueId, [...(byLeague.get(m.leagueId) ?? []), m]);
      }
      const missing = api.leagues.filter((l) => l.gamesCount > 0 && !byLeague.has(l.id));
      const unavailable = new Set<number>();
      await pool(missing, LEAGUE_CONCURRENCY, async (l: League) => {
        const ms = await fetchLeagueMatches(l.id);
        if (ms && ms.length) byLeague.set(l.id, ms.map((m) => ({ ...m, league: l.name, kind: l.kind })));
        else unavailable.add(l.id);
      });

      // 2. Cotes (GetGame) des matchs non terminés, puis prédictions.
      const all = await enrichWithOdds([...byLeague.values()].flat());
      const predicted = new Map<number, MatchWithPrediction[]>();
      for (const m of all) {
        if (m.leagueId === undefined) continue;
        predicted.set(m.leagueId, [...(predicted.get(m.leagueId) ?? []), withPrediction(m)]);
      }

      setLeagues(api.leagues.map((l) => {
        const matches = (predicted.get(l.id) ?? []).sort((a, b) => a.startsAt - b.startsAt);
        const load = matches.length ? 'loaded' : unavailable.has(l.id) ? 'unavailable' : 'empty';
        return { ...l, matches, load };
      }));
    } finally {
      setUpdatedAt(Date.now());
      setLoading(false);
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  return { leagues, apiError, latency, loading, updatedAt, reload: load };
}
