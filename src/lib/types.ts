import type { Prediction, TeamHistory } from './predictionEngine';

export interface Team {
  name: string;
  short: string;
  /** Couleurs principales utilisées pour l'écusson généré (pas de logo officiel). */
  colors: [string, string];
  /** Id dans la table Supabase `teams`, si l'équipe y existe. */
  dbId?: number;
  logoUrl?: string | null;
}

export type MatchStatus = 'upcoming' | 'live' | 'finished';

export interface Match {
  id: string;
  league: string;
  home: Team;
  away: Team;
  startsAt: number; // timestamp ms
  status: MatchStatus;
  odds?: { home?: number; draw?: number; away?: number };
}

export interface MatchWithPrediction extends Match {
  prediction: Prediction | null;
  homeHistory: TeamHistory;
  awayHistory: TeamHistory;
}

/** Origine des matchs affichés : API Melbet, base Supabase ou données de démo. */
export type DataSource = 'api' | 'database' | 'fallback';

/** État de la base : non configurée (mode démo), connectée, ou en erreur. */
export type DbState = 'disabled' | 'connected' | 'error';
