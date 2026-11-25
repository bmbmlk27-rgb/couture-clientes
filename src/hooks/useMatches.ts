import { useCallback, useEffect, useRef, useState } from 'react';
import { enrichWithOdds, fetchMatches } from '../lib/api';
import { calculateHybridPrediction, type TeamHistory } from '../lib/predictionEngine';
import { mergeFixtures } from '../lib/fixtures';
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
  // Cotes 1X2 si disponibles (API ou saisie admin), sinon historique.
  return { ...m, homeHistory, awayHistory, prediction: calculateHybridPrediction(m.odds, homeHistory, awayHistory, AVG_LEAGUE_GOALS) };
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
      // Étape 2 de l'API Melbet : cotes 1X2 des matchs à venir (GetGame).
      const apiMatches = api.matches ? await enrichWithOdds(api.matches) : null;

      /* ----- Mode démo : Supabase non configuré ----- */
      if (!isSupabaseConfigured) {
        const fixtures = apiMatches ?? generateMockMatches();
        setSource(apiMatches ? 'api' : 'fallback');
        setMatches(fixtures.map((m) => predict(m, getSimulatedHistory(m.home.name), getSimulatedHistory(m.away.name))));
        return;
      }

      /* ----- Mode production : historiques réels depuis Supabase ----- */
      try {
        const teams = await fetchTeams();
        // Matchs saisis dans /admin : toujours affichés, fusionnés avec ceux de l'API.
        const dbFixtures = await fetchDbFixtures(teams);
        let fixtures: Match[];
        if (apiMatches) {
          const linked = apiMatches.map((m) => ({ ...m, home: attachDbTeam(m.home, teams), away: attachDbTeam(m.away, teams) }));
          fixtures = mergeFixtures(linked, dbFixtures);
          setSource(fixtures.some((m) => m.origin === 'database') ? 'mixed' : 'api');
        } else {
          fixtures = dbFixtures;
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
        // Base injoignable : on affiche quand même les matchs de l'API.
        setDbState('error');
        setDbError(e instanceof Error ? e.message : String(e));
        // (les matchs avec cotes gardent une prédiction : elle ne dépend pas de la base)
        setSource(apiMatches ? 'api' : 'database');
        setMatches((apiMatches ?? []).map((m) => predict(m, EMPTY_HISTORY, EMPTY_HISTORY)));
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
