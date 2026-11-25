import type { PartialOdds } from './odds';
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
  /** Cotes 1X2 (API Melbet ou saisie manuelle dans /admin). */
  odds?: PartialOdds;
  /** Identifiant numérique Melbet, pour récupérer les cotes via /api/melbet-odds. */
  apiGameId?: string;
  /** Origine du match : API Melbet, base Supabase (saisie admin) ou démo. */
  origin?: 'api' | 'database' | 'demo';
}

export interface MatchWithPrediction extends Match {
  prediction: Prediction | null;
  homeHistory: TeamHistory;
  awayHistory: TeamHistory;
}

/** Origine des matchs affichés : API Melbet, API + saisies admin, base Supabase seule, ou démo. */
export type DataSource = 'api' | 'mixed' | 'database' | 'fallback';

/** État de la base : non configurée (mode démo), connectée, ou en erreur. */
export type DbState = 'disabled' | 'connected' | 'error';
