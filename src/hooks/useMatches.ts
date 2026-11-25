import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMatches } from '../lib/api';
import { calculateDoublePoisson, type TeamHistory } from '../lib/predictionEngine';
import { AVG_LEAGUE_GOALS } from '../lib/config';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  EMPTY_HISTORY, createHistoryLoader, fetchDbFixtures, fetchTeams, findDbTeam, subscribeToMatches, type DbTeam,
} from '../lib/db';
import { getSimulatedHistory, resolveTeam } from '../data/teams';
import { generateMockMatches } from '../data/mockMatches';
import type { DataSource, DbState, Match, MatchWithPrediction, Team } from '../lib/types';

const REFRESH_MS = 60_000;

function predict(m: Match, homeHistory: TeamHistory, awayHistory: TeamHistory): MatchWithPrediction {
  return { ...m, homeHistory, awayHistory, prediction: calculateDoublePoisson(homeHistory, awayHistory, AVG_LEAGUE_GOALS) };
}

/** Rattache une équipe venant de l'API à son id/logo Supabase. */
function attachDbTeam(team: Team, teams: DbTeam[]): Team {
  if (team.dbId) return team;
  const db = findDbTeam(team.name, teams);
  return db ? resolveTeam(db.name, { dbId: db.id, logoUrl: db.logo_url }) : team;
}

export function useMatches() {
  const [matches, setMatches] = useState<MatchWithPrediction[]>([]);
  const [source, setSource] = useState<DataSource>('fallback');
  const [apiError, setApiError] = useState<string | undefined>();
  const [dbState, setDbState] = useState<DbState>(isSupabaseConfigured ? 'connected' : 'disabled');
  const [dbError, setDbError] = useState<string | undefined>();
  const [latency, setLatency] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());
  const busy = useRef(false);
  const rerun = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    if (busy.current) {
      rerun.current = true; // une modification est arrivée pendant le chargement
      return;
    }
    busy.current = true;
    setLoading(true);
    try {
      const api = await fetchMatches();
      setApiError(api.error);
      setLatency(api.latencyMs);

      /* ----- Mode démo : Supabase non configuré ----- */
      if (!isSupabaseConfigured) {
        const fixtures = api.matches ?? generateMockMatches();
        setSource(api.matches ? 'api' : 'fallback');
        setMatches(fixtures.map((m) => predict(m, getSimulatedHistory(m.home.name), getSimulatedHistory(m.away.name))));
        return;
      }

      /* ----- Mode production : historiques réels depuis Supabase ----- */
      try {
        const teams = await fetchTeams();
        let fixtures: Match[];
        if (api.matches) {
          fixtures = api.matches.map((m) => ({ ...m, home: attachDbTeam(m.home, teams), away: attachDbTeam(m.away, teams) }));
          setSource('api');
        } else {
          fixtures = await fetchDbFixtures(teams);
          setSource('database');
        }
        const loadHistory = createHistoryLoader();
        const history = (t: Team) => (t.dbId ? loadHistory(t.dbId) : Promise.resolve(EMPTY_HISTORY));
        const withPred = await Promise.all(
          fixtures.map(async (m) => {
            const [hh, ah] = await Promise.all([history(m.home), history(m.away)]);
            return predict(m, hh, ah);
          }),
        );
        setMatches(withPred);
        setDbState('connected');
        setDbError(undefined);
      } catch (e) {
        // Base injoignable : on affiche quand même les matchs de l'API (sans prédiction).
        setDbState('error');
        setDbError(e instanceof Error ? e.message : String(e));
        setSource(api.matches ? 'api' : 'database');
        setMatches((api.matches ?? []).map((m) => predict(m, EMPTY_HISTORY, EMPTY_HISTORY)));
      }
    } finally {
      setUpdatedAt(Date.now());
      setLoading(false);
      busy.current = false;
    }
    if (rerun.current) {
      rerun.current = false;
      return load();
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    // Recalcul automatique quand l'admin ajoute / supprime un match.
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeToMatches(() => {
      clearTimeout(debounce);
      debounce = setTimeout(load, 600);
    });
    return () => {
      clearInterval(id);
      clearTimeout(debounce);
      unsubscribe();
    };
  }, [load]);

  return { matches, source, apiError, dbState, dbError, latency, loading, updatedAt, reload: load };
}
