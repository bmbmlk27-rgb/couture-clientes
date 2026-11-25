import { useCallback, useEffect, useRef, useState } from 'react';
import { enrichWithOdds, fetchMatches } from '../lib/api';
import { predictPenalty, type PenaltyPrediction } from '../lib/penaltyEngine';
import type { Odds } from '../lib/odds';
import type { MatchWithPrediction } from '../lib/types';

/** Les matchs Penalty durent quelques minutes : rafraîchissement fréquent. */
const REFRESH_MS = 20_000;

/** Le calage dépend uniquement des cotes : on garde le résultat pour des cotes identiques. */
const predictionCache = new Map<string, PenaltyPrediction | null>();
function cachedPrediction(odds: Odds | undefined): PenaltyPrediction | null {
  if (!odds) return null;
  const key = `${odds.home}|${odds.draw ?? ''}|${odds.away}`;
  if (!predictionCache.has(key)) {
    if (predictionCache.size > 500) predictionCache.clear();
    predictionCache.set(key, predictPenalty(odds));
  }
  return predictionCache.get(key)!;
}

export function usePenaltyMatches() {
  const [matches, setMatches] = useState<MatchWithPrediction[]>([]);
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
      const api = await fetchMatches();
      setApiError(api.error);
      setLatency(api.latencyMs);
      if (!api.matches) return; // on garde les derniers matchs affichés
      const withOdds = await enrichWithOdds(api.matches);
      setMatches(withOdds.map((m) => ({ ...m, prediction: cachedPrediction(m.odds) })));
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

  return { matches, apiError, latency, loading, updatedAt, reload: load };
}
