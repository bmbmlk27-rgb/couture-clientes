import type { Odds } from './odds';
import type { PenaltyPrediction } from './penaltyEngine';
import type { MatchPrediction } from './matchEngine';

export interface Team {
  name: string;
  short: string;
  /** Couleurs principales utilisées pour l'écusson généré (pas de logo officiel). */
  colors: [string, string];
}

export type MatchStatus = 'upcoming' | 'live' | 'finished';

/** 'penalty' : séance de tirs au but ; 'match' : match classique (90 min, 3x3, 5x5…). */
export type MatchKind = 'penalty' | 'match';

export interface League {
  id: number;
  name: string;
  country?: string;
  /** Nombre de matchs annoncés par Melbet. */
  gamesCount: number;
  kind: MatchKind;
}

export interface Match {
  id: string;
  league: string;
  leagueId?: number;
  kind: MatchKind;
  home: Team;
  away: Team;
  startsAt: number; // timestamp ms
  status: MatchStatus;
  /** Cotes vainqueur (1X2 ou 2 issues). */
  odds?: Odds;
  /** Identifiant numérique Melbet, pour récupérer les cotes via /api/melbet-odds. */
  apiGameId?: string;
  /** Score en cours (« 3 - 2 ») d'un match commencé. */
  liveScore?: string;
  /** Match vu lors d'un appel précédent, absent de la dernière réponse Melbet (statut estimé). */
  remembered?: boolean;
}

export interface MatchWithPrediction extends Match {
  /** Rempli pour kind = 'penalty'. */
  penalty: PenaltyPrediction | null;
  /** Rempli pour kind = 'match'. */
  match: MatchPrediction | null;
}

/** État du chargement des matchs d'un championnat. */
export type LeagueLoad = 'loaded' | 'unavailable' | 'empty';

export interface LeagueWithMatches extends League {
  matches: MatchWithPrediction[];
  load: LeagueLoad;
}
