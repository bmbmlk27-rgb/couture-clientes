import type { RealtimeChannel } from '@supabase/supabase-js';
import { requireSupabase, supabase } from './supabase';
import { calculateHybridPrediction, type TeamHistory } from './predictionEngine';
import { isCompleteOdds, type Odds } from './odds';
import { AVG_LEAGUE_GOALS } from './config';
import { resolveTeam, sameTeam } from '../data/teams';
import type { Match, MatchStatus } from './types';

/* ------------------------------------------------------------------ */
/* Types des lignes (cf. supabase/schema.sql)                          */
/* ------------------------------------------------------------------ */

export interface DbTeam {
  id: number;
  name: string;
  logo_url: string | null;
}

export interface DbMatch {
  id: number;
  home_team_id: number;
  away_team_id: number;
  match_date: string;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
  home_ht_score: number | null;
  away_ht_score: number | null;
  /** Cotes 1X2 saisies à la main (toutes les trois ou aucune). */
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
}

export type NewMatch = Omit<DbMatch, 'id'>;

const MATCH_COLUMNS =
  'id, home_team_id, away_team_id, match_date, status, home_score, away_score, home_ht_score, away_ht_score, odds_home, odds_draw, odds_away';

/** Cotes d'une ligne `matches` (numeric arrive parfois en chaîne). */
export function oddsOf(m: Pick<DbMatch, 'odds_home' | 'odds_draw' | 'odds_away'>): Odds | undefined {
  const o = { home: Number(m.odds_home), draw: Number(m.odds_draw), away: Number(m.odds_away) };
  return m.odds_home != null && isCompleteOdds(o) ? o : undefined;
}

/** Convertit une erreur PostgREST en message lisible. */
function fail(context: string, error: { message: string; code?: string }): never {
  const hint =
    error.code === '42501' ? ' (droits insuffisants : ce compte est-il dans la table admins ?)' :
    error.code === '42P01' ? ' (table absente : exécutez supabase/schema.sql)' : '';
  throw new Error(`${context} : ${error.message}${hint}`);
}

/* ------------------------------------------------------------------ */
/* Équipes                                                             */
/* ------------------------------------------------------------------ */

export async function fetchTeams(): Promise<DbTeam[]> {
  const { data, error } = await requireSupabase().from('teams').select('id, name, logo_url').order('name');
  if (error) fail('Lecture des équipes', error);
  return data ?? [];
}

export async function insertTeam(name: string, logoUrl?: string): Promise<DbTeam> {
  const { data, error } = await requireSupabase()
    .from('teams')
    .insert({ name: name.trim(), logo_url: logoUrl?.trim() || null })
    .select('id, name, logo_url')
    .single();
  if (error) fail('Ajout de l’équipe', error);
  return data;
}

/** Associe (ou retire, avec null) l'URL du logo d'une équipe existante. */
export async function updateTeamLogo(id: number, logoUrl: string | null): Promise<DbTeam> {
  const { data, error } = await requireSupabase()
    .from('teams')
    .update({ logo_url: logoUrl?.trim() || null })
    .eq('id', id)
    .select('id, name, logo_url')
    .single();
  if (error) fail('Mise à jour du logo', error);
  return data;
}

/** Associe un nom venant de l'API Melbet à une équipe de la base (alias tolérés). */
export function findDbTeam(name: string, teams: DbTeam[]): DbTeam | undefined {
  return teams.find((t) => sameTeam(t.name, name));
}

/* ------------------------------------------------------------------ */
/* Historique → moteur Poisson                                         */
/* ------------------------------------------------------------------ */

/** Transforme les lignes `matches` en buts marqués / encaissés du point de vue de l'équipe. */
export function historyFromRows(teamId: number, rows: Pick<DbMatch, 'home_team_id' | 'home_score' | 'away_score'>[]): TeamHistory {
  const goalsScored: number[] = [];
  const goalsConceded: number[] = [];
  for (const r of rows) {
    if (r.home_score == null || r.away_score == null) continue;
    const isHome = r.home_team_id === teamId;
    goalsScored.push(isHome ? r.home_score : r.away_score);
    goalsConceded.push(isHome ? r.away_score : r.home_score);
  }
  return { goalsScored, goalsConceded };
}

/**
 * Historique réel d'une équipe : ses 10 derniers matchs TERMINÉS
 * (domicile ou extérieur), du plus récent au plus ancien.
 */
export async function getTeamHistory(teamId: number, limit = 10): Promise<TeamHistory> {
  const { data, error } = await requireSupabase()
    .from('matches')
    .select('home_team_id, away_team_id, home_score, away_score, match_date')
    .eq('status', 'finished')
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order('match_date', { ascending: false })
    .limit(limit);
  if (error) fail('Lecture de l’historique', error);
  return historyFromRows(teamId, data ?? []);
}

/** Cache par chargement : évite de requêter deux fois la même équipe. */
export function createHistoryLoader() {
  const cache = new Map<number, Promise<TeamHistory>>();
  return (teamId: number) => {
    if (!cache.has(teamId)) cache.set(teamId, getTeamHistory(teamId));
    return cache.get(teamId)!;
  };
}

export const EMPTY_HISTORY: TeamHistory = { goalsScored: [], goalsConceded: [] };

/* ------------------------------------------------------------------ */
/* Matchs                                                              */
/* ------------------------------------------------------------------ */

/** Matchs à venir / en cours saisis dans la base (utilisés si l'API Melbet est indisponible). */
export async function fetchDbFixtures(teams: DbTeam[]): Promise<Match[]> {
  const { data, error } = await requireSupabase()
    .from('matches')
    .select(MATCH_COLUMNS)
    .in('status', ['upcoming', 'live'])
    .order('match_date', { ascending: true })
    .limit(60);
  if (error) fail('Lecture des matchs à venir', error);
  const byId = new Map(teams.map((t) => [t.id, t]));
  return (data ?? []).flatMap((m: DbMatch) => {
    const home = byId.get(m.home_team_id);
    const away = byId.get(m.away_team_id);
    if (!home || !away) return [];
    return [{
      id: `db-${m.id}`,
      league: 'FC 26. Championnat d\'Allemagne',
      home: resolveTeam(home.name, { dbId: home.id, logoUrl: home.logo_url }),
      away: resolveTeam(away.name, { dbId: away.id, logoUrl: away.logo_url }),
      startsAt: Date.parse(m.match_date),
      status: m.status,
      odds: oddsOf(m),
      origin: 'database' as const,
    }];
  });
}

export async function fetchRecentMatches(limit = 30): Promise<DbMatch[]> {
  const { data, error } = await requireSupabase()
    .from('matches')
    .select(MATCH_COLUMNS)
    .order('match_date', { ascending: false })
    .limit(limit);
  if (error) fail('Lecture des derniers matchs', error);
  return data ?? [];
}

export async function insertMatch(match: NewMatch): Promise<DbMatch> {
  const { data, error } = await requireSupabase().from('matches').insert(match).select(MATCH_COLUMNS).single();
  if (error) fail('Enregistrement du match', error);
  return data;
}

/** Met à jour un match (ex. passer un match « À venir » à « Terminé » avec son score). */
export async function updateMatch(id: number, patch: Partial<NewMatch>): Promise<DbMatch> {
  const { data, error } = await requireSupabase().from('matches').update(patch).eq('id', id).select(MATCH_COLUMNS).single();
  if (error) fail('Mise à jour du match', error);
  return data;
}

export async function deleteMatch(id: number): Promise<void> {
  const { error } = await requireSupabase().from('matches').delete().eq('id', id);
  if (error) fail('Suppression du match', error);
}

/* ------------------------------------------------------------------ */
/* Prédictions                                                         */
/* ------------------------------------------------------------------ */

/**
 * Recalcule et enregistre (table `predictions`) la prédiction de chaque match
 * à venir / en cours de la base : cotes saisies si présentes, sinon historique. Appelé par l'admin après chaque saisie.
 * Les lignes sont ajoutées (pas écrasées) pour garder l'historique des prédictions.
 */
export async function recomputeUpcomingPredictions(): Promise<{ computed: number; skipped: number }> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('matches')
    .select(MATCH_COLUMNS)
    .in('status', ['upcoming', 'live']);
  if (error) fail('Lecture des matchs à prédire', error);

  const load = createHistoryLoader();
  const rows = [];
  let skipped = 0;
  for (const m of (data ?? []) as DbMatch[]) {
    const [hh, ah] = await Promise.all([load(m.home_team_id), load(m.away_team_id)]);
    const p = calculateHybridPrediction(oddsOf(m), hh, ah, AVG_LEAGUE_GOALS);
    if (!p) { skipped++; continue; }
    rows.push({
      match_id: m.id,
      predicted_winner: p.winner,
      predicted_score_ft: p.fullTimeScore,
      predicted_score_ht: p.halfTimeScore,
      confidence: p.confidence,
      basis: p.basis,
    });
  }
  if (rows.length) {
    const { error: insErr } = await sb.from('predictions').insert(rows);
    if (insErr) fail('Enregistrement des prédictions', insErr);
  }
  return { computed: rows.length, skipped };
}

/* ------------------------------------------------------------------ */
/* Admin & temps réel                                                  */
/* ------------------------------------------------------------------ */

export async function currentUserIsAdmin(): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc('is_admin');
  if (error) fail('Vérification des droits', error);
  return data === true;
}

/** Notifie `onChange` à chaque ajout / suppression de match (Supabase Realtime). */
export function subscribeToMatches(onChange: () => void): () => void {
  if (!supabase) return () => {};
  const channel: RealtimeChannel = supabase
    .channel('matches-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, onChange)
    .subscribe();
  return () => { supabase!.removeChannel(channel); };
}
