import type { Prediction, TeamHistory } from './predictionEngine';

export interface Team {
  name: string;
  short: string;
  /** Couleurs principales utilisées pour l'écusson généré (pas de logo officiel). */
  colors: [string, string];
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

export type DataSource = 'api' | 'fallback';
