import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMatches } from '../lib/api';
import { calculateDoublePoisson } from '../lib/predictionEngine';
import { getTeamHistory } from '../data/teams';
import { generateMockMatches } from '../data/mockMatches';
import type { DataSource, Match, MatchWithPrediction } from '../lib/types';

const REFRESH_MS = 60_000;

function withPredictions(matches: Match[]): MatchWithPrediction[] {
  return matches.map((m) => {
    const homeHistory = getTeamHistory(m.home.name);
    const awayHistory = getTeamHistory(m.away.name);
    return { ...m, homeHistory, awayHistory, prediction: calculateDoublePoisson(homeHistory, awayHistory) };
  });
}

export function useMatches() {
  const [matches, setMatches] = useState<MatchWithPrediction[]>([]);
  const [source, setSource] = useState<DataSource>('fallback');
  const [error, setError] = useState<string | undefined>();
  const [latency, setLatency] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    const res = await fetchMatches();
    if (res.matches) {
      setMatches(withPredictions(res.matches));
      setSource('api');
      setError(undefined);
      setLatency(res.latencyMs);
    } else {
      setMatches(withPredictions(generateMockMatches()));
      setSource('fallback');
      setError(res.error);
      setLatency(undefined);
    }
    setUpdatedAt(Date.now());
    setLoading(false);
    busy.current = false;
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  return { matches, source, error, latency, loading, updatedAt, reload: load };
}
