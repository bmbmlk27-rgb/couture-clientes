// predictionEngine.ts — modèle Double Poisson (implémentation de référence fournie).
export interface TeamHistory {
  goalsScored: number[];
  goalsConceded: number[];
}

export interface Prediction {
  winner: 'Domicile' | 'Extérieur' | 'Match Nul';
  confidence: number;
  halfTimeScore: string;
  fullTimeScore: string;
  source: string;
}

export function calculateDoublePoisson(
  homeHistory: TeamHistory,
  awayHistory: TeamHistory
): Prediction | null {
  if (homeHistory.goalsScored.length < 3 || awayHistory.goalsScored.length < 3) {
    return null; // Pas assez de données
  }

  const avgHomeScored = homeHistory.goalsScored.reduce((a, b) => a + b, 0) / homeHistory.goalsScored.length;
  const avgHomeConceded = homeHistory.goalsConceded.reduce((a, b) => a + b, 0) / homeHistory.goalsConceded.length;
  const avgAwayScored = awayHistory.goalsScored.reduce((a, b) => a + b, 0) / awayHistory.goalsScored.length;
  const avgAwayConceded = awayHistory.goalsConceded.reduce((a, b) => a + b, 0) / awayHistory.goalsConceded.length;

  const lambdaHome = (avgHomeScored * avgAwayConceded) * 1.1;
  const lambdaAway = (avgAwayScored * avgHomeConceded) * 0.9;

  const factorial = (n: number): number => n <= 1 ? 1 : n * factorial(n - 1);
  const poisson = (k: number, lambda: number) => (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);

  let bestHT = { score: '0 - 0', prob: 0 };
  let bestFT = { score: '0 - 0', prob: 0 };
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;

  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) {
      const pFt = poisson(i, lambdaHome) * poisson(j, lambdaAway);
      if (pFt > bestFT.prob) { bestFT = { score: `${i} - ${j}`, prob: pFt }; }
      if (i > j) homeWinProb += pFt;
      else if (i === j) drawProb += pFt;
      else awayWinProb += pFt;
      const pHt = poisson(i, lambdaHome * 0.45) * poisson(j, lambdaAway * 0.45);
      if (pHt > bestHT.prob) { bestHT = { score: `${i} - ${j}`, prob: pHt }; }
    }
  }

  let winner: Prediction['winner'] = 'Match Nul';
  let maxProb = drawProb;
  if (homeWinProb > maxProb) { winner = 'Domicile'; maxProb = homeWinProb; }
  if (awayWinProb > maxProb) { winner = 'Extérieur'; maxProb = awayWinProb; }

  let [ftHome, ftAway] = bestFT.score.split(' - ').map(Number);
  if (winner === 'Domicile' && ftHome <= ftAway) ftHome = ftAway + 1;
  if (winner === 'Extérieur' && ftAway <= ftHome) ftAway = ftHome + 1;
  if (winner === 'Match Nul' && ftHome !== ftAway) { ftHome = Math.max(ftHome, ftAway); ftAway = ftHome; }

  return {
    winner,
    confidence: Math.round(maxProb * 1000) / 10,
    halfTimeScore: bestHT.score,
    fullTimeScore: `${ftHome} - ${ftAway}`,
    source: 'Double Poisson'
  };
}
