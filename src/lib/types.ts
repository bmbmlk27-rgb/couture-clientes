import type { Odds } from './odds';
import type { PenaltyPrediction } from './penaltyEngine';

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
  /** Cotes vainqueur (1X2 ou 2 issues). */
  odds?: Odds;
  /** Identifiant numérique Melbet, pour récupérer les cotes via /api/melbet-odds. */
  apiGameId?: string;
  /** Score en cours (« 3 - 2 ») d'un match commencé. */
  liveScore?: string;
}

export interface MatchWithPrediction extends Match {
  prediction: PenaltyPrediction | null;
}
