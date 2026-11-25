// predictionEngine.ts — modèle Double Poisson normalisé par la moyenne de la ligue.

export interface TeamHistory {
  goalsScored: number[];
  goalsConceded: number[];
}

export type Winner = 'Domicile' | 'Extérieur' | 'Match Nul';

export interface Prediction {
  /** Issue la plus probable selon la somme des probabilités 1 / N / 2. */
  winner: Winner;
  /** Probabilité (en %) de l'issue `winner`. */
  confidence: number;
  /** Score exact le plus probable à la mi-temps (cellule max de la matrice). */
  halfTimeScore: string;
  /** Score exact le plus probable en fin de match (cellule max de la matrice, non corrigé). */
  fullTimeScore: string;
  /** Probabilité (en %) du score exact `fullTimeScore`. */
  fullTimeScoreProbability: number;
  /** Probabilités 1 / N / 2 en %. */
  probabilities: { home: number; draw: number; away: number };
  /** Buts attendus de chaque équipe. */
  lambdaHome: number;
  lambdaAway: number;
  /**
   * `false` quand le score exact le plus probable ne correspond pas au vainqueur
   * prédit (ex. 1-1 alors que « Domicile » est l'issue la plus probable).
   */
  scoreMatchesWinner: boolean;
  source: string;
}

export const DEFAULT_AVG_LEAGUE_GOALS = 2.5;
export const HOME_ADVANTAGE = 1.1;
export const AWAY_PENALTY = 0.9;
export const HALF_TIME_SHARE = 0.45;
const MAX_GOALS = 8;

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
const poisson = (k: number, lambda: number) => (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
const pct = (p: number) => Math.round(p * 1000) / 10;

function winnerOf(home: number, away: number): Winner {
  return home > away ? 'Domicile' : home < away ? 'Extérieur' : 'Match Nul';
}

export function calculateDoublePoisson(
  homeHistory: TeamHistory,
  awayHistory: TeamHistory,
  avgLeagueGoals: number = DEFAULT_AVG_LEAGUE_GOALS,
): Prediction | null {
  if (homeHistory.goalsScored.length < 3 || awayHistory.goalsScored.length < 3) {
    return null; // Pas assez de données
  }
  if (!(avgLeagueGoals > 0)) throw new Error('avgLeagueGoals doit être > 0');

  const avgHomeScored = mean(homeHistory.goalsScored);
  const avgHomeConceded = mean(homeHistory.goalsConceded);
  const avgAwayScored = mean(awayHistory.goalsScored);
  const avgAwayConceded = mean(awayHistory.goalsConceded);

  // Force d'attaque / faiblesse défensive relatives à la moyenne de la ligue.
  const lambdaHome = (avgHomeScored / avgLeagueGoals) * (avgAwayConceded / avgLeagueGoals) * avgLeagueGoals * HOME_ADVANTAGE;
  const lambdaAway = (avgAwayScored / avgLeagueGoals) * (avgHomeConceded / avgLeagueGoals) * avgLeagueGoals * AWAY_PENALTY;

  let bestHT = { home: 0, away: 0, prob: -1 };
  let bestFT = { home: 0, away: 0, prob: -1 };
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;
  let total = 0;

  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const pFt = poisson(i, lambdaHome) * poisson(j, lambdaAway);
      total += pFt;
      if (pFt > bestFT.prob) bestFT = { home: i, away: j, prob: pFt };
      if (i > j) homeWinProb += pFt;
      else if (i === j) drawProb += pFt;
      else awayWinProb += pFt;

      const pHt = poisson(i, lambdaHome * HALF_TIME_SHARE) * poisson(j, lambdaAway * HALF_TIME_SHARE);
      if (pHt > bestHT.prob) bestHT = { home: i, away: j, prob: pHt };
    }
  }

  // Renormalise sur la grille 0..8 (la masse hors grille est négligeable mais non nulle).
  homeWinProb /= total;
  drawProb /= total;
  awayWinProb /= total;

  let winner: Winner = 'Match Nul';
  let maxProb = drawProb;
  if (homeWinProb > maxProb) { winner = 'Domicile'; maxProb = homeWinProb; }
  if (awayWinProb > maxProb) { winner = 'Extérieur'; maxProb = awayWinProb; }

  return {
    winner,
    confidence: pct(maxProb),
    halfTimeScore: `${bestHT.home} - ${bestHT.away}`,
    fullTimeScore: `${bestFT.home} - ${bestFT.away}`,
    fullTimeScoreProbability: pct(bestFT.prob / total),
    probabilities: { home: pct(homeWinProb), draw: pct(drawProb), away: pct(awayWinProb) },
    lambdaHome: Math.round(lambdaHome * 100) / 100,
    lambdaAway: Math.round(lambdaAway * 100) / 100,
    scoreMatchesWinner: winnerOf(bestFT.home, bestFT.away) === winner,
    source: 'Double Poisson',
  };
}
