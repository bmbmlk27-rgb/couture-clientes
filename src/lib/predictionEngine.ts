// predictionEngine.ts — Double Poisson (historique) et modèle hybride (cotes 1X2).
import { impliedProbabilities, isCompleteOdds, type PartialOdds } from './odds';

export interface TeamHistory {
  goalsScored: number[];
  goalsConceded: number[];
}

export type Winner = 'Domicile' | 'Extérieur' | 'Match Nul';

/** Base de calcul de la prédiction. */
export type PredictionBasis = 'odds' | 'history';

export interface Prediction {
  /** Issue la plus probable selon les probabilités 1 / N / 2. */
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
  /** 'odds' : cotes 1X2 du bookmaker ; 'history' : historique des équipes. */
  basis: PredictionBasis;
  /** Marge du bookmaker en % (uniquement si basis = 'odds'). */
  bookmakerMargin?: number;
  source: string;
}

export const DEFAULT_AVG_LEAGUE_GOALS = 2.5;
export const HOME_ADVANTAGE = 1.1;
export const AWAY_PENALTY = 0.9;
export const HALF_TIME_SHARE = 0.45;
const MAX_GOALS = 8;

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const FACTORIALS = Array.from({ length: MAX_GOALS + 1 }, (_, n) => {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
});
const poisson = (k: number, lambda: number) => (Math.pow(lambda, k) * Math.exp(-lambda)) / FACTORIALS[k];
const pct = (p: number) => Math.round(p * 1000) / 10;

function winnerOf(home: number, away: number): Winner {
  return home > away ? 'Domicile' : home < away ? 'Extérieur' : 'Match Nul';
}

interface Matrix {
  bestFT: { home: number; away: number; prob: number };
  bestHT: { home: number; away: number; prob: number };
  /** Probabilités 1 / N / 2 renormalisées sur la grille 0..8. */
  home: number;
  draw: number;
  away: number;
  total: number;
}

/** Parcourt la matrice des scores 0..8 × 0..8 pour deux λ donnés. */
function scoreMatrix(lambdaHome: number, lambdaAway: number, withHalfTime = true): Matrix {
  const ph = FACTORIALS.map((_, k) => poisson(k, lambdaHome));
  const pa = FACTORIALS.map((_, k) => poisson(k, lambdaAway));
  const phHt = withHalfTime ? FACTORIALS.map((_, k) => poisson(k, lambdaHome * HALF_TIME_SHARE)) : [];
  const paHt = withHalfTime ? FACTORIALS.map((_, k) => poisson(k, lambdaAway * HALF_TIME_SHARE)) : [];

  let bestHT = { home: 0, away: 0, prob: -1 };
  let bestFT = { home: 0, away: 0, prob: -1 };
  let home = 0;
  let draw = 0;
  let away = 0;
  let total = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const pFt = ph[i] * pa[j];
      total += pFt;
      if (pFt > bestFT.prob) bestFT = { home: i, away: j, prob: pFt };
      if (i > j) home += pFt;
      else if (i === j) draw += pFt;
      else away += pFt;
      if (withHalfTime) {
        const pHt = phHt[i] * paHt[j];
        if (pHt > bestHT.prob) bestHT = { home: i, away: j, prob: pHt };
      }
    }
  }
  return { bestFT, bestHT, home: home / total, draw: draw / total, away: away / total, total };
}

/** Construit la prédiction à partir des λ et des probabilités 1/N/2 retenues. */
function buildPrediction(
  lambdaHome: number,
  lambdaAway: number,
  outcome: { home: number; draw: number; away: number } | null,
  basis: PredictionBasis,
  extra: Partial<Prediction> = {},
): Prediction {
  const m = scoreMatrix(lambdaHome, lambdaAway);
  const p = outcome ?? m;

  let winner: Winner = 'Match Nul';
  let maxProb = p.draw;
  if (p.home > maxProb) { winner = 'Domicile'; maxProb = p.home; }
  if (p.away > maxProb) { winner = 'Extérieur'; maxProb = p.away; }

  return {
    winner,
    confidence: pct(maxProb),
    halfTimeScore: `${m.bestHT.home} - ${m.bestHT.away}`,
    fullTimeScore: `${m.bestFT.home} - ${m.bestFT.away}`,
    fullTimeScoreProbability: pct(m.bestFT.prob / m.total),
    probabilities: { home: pct(p.home), draw: pct(p.draw), away: pct(p.away) },
    lambdaHome: Math.round(lambdaHome * 100) / 100,
    lambdaAway: Math.round(lambdaAway * 100) / 100,
    scoreMatchesWinner: winnerOf(m.bestFT.home, m.bestFT.away) === winner,
    basis,
    source: basis === 'odds' ? 'Cotes 1X2 + Poisson' : 'Double Poisson',
    ...extra,
  };
}

/* ------------------------------------------------------------------ */
/* 1. Double Poisson sur l'historique                                   */
/* ------------------------------------------------------------------ */

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

  return buildPrediction(lambdaHome, lambdaAway, null, 'history');
}

/* ------------------------------------------------------------------ */
/* 2. λ implicites dans les cotes                                       */
/* ------------------------------------------------------------------ */

const LAMBDA_MIN = 0.05;
const LAMBDA_MAX = 6;

/**
 * Trouve (λdom, λext) dont les probabilités Poisson 1/N/2 sont les plus proches
 * (moindres carrés) des probabilités implicites. Recherche sur grille grossière
 * puis raffinements locaux : déterministe, sans dérivée, ~2 ms.
 */
export function fitLambdasToOutcome(target: { home: number; draw: number; away: number }): {
  lambdaHome: number; lambdaAway: number; error: number;
} {
  const vector = (l: number) => FACTORIALS.map((_, k) => poisson(k, l));
  const range = (lo: number, hi: number, step: number) => {
    const out: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += step) out.push(v);
    return out;
  };
  let best = { lambdaHome: 1, lambdaAway: 1, error: Infinity };
  // Les vecteurs de Poisson sont calculés une fois par valeur de λ (pas par couple).
  const scan = (h0: number, h1: number, a0: number, a1: number, step: number) => {
    const hs = range(h0, h1, step);
    const as = range(a0, a1, step);
    const hv = hs.map(vector);
    const av = as.map(vector);
    for (let x = 0; x < hs.length; x++) {
      const ph = hv[x];
      for (let y = 0; y < as.length; y++) {
        const pa = av[y];
        let home = 0, draw = 0, away = 0;
        for (let i = 0; i <= MAX_GOALS; i++) {
          for (let j = 0; j <= MAX_GOALS; j++) {
            const v = ph[i] * pa[j];
            if (i > j) home += v; else if (i === j) draw += v; else away += v;
          }
        }
        const t = home + draw + away;
        const e = (home / t - target.home) ** 2 + (draw / t - target.draw) ** 2 + (away / t - target.away) ** 2;
        if (e < best.error) best = { lambdaHome: hs[x], lambdaAway: as[y], error: e };
      }
    }
  };
  scan(LAMBDA_MIN, LAMBDA_MAX, LAMBDA_MIN, LAMBDA_MAX, 0.1);
  for (const step of [0.02, 0.004, 0.001]) {
    const r = step * 6;
    const { lambdaHome: h, lambdaAway: a } = best;
    scan(Math.max(LAMBDA_MIN, h - r), Math.min(LAMBDA_MAX, h + r), Math.max(LAMBDA_MIN, a - r), Math.min(LAMBDA_MAX, a + r), step);
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* 3. Modèle hybride                                                    */
/* ------------------------------------------------------------------ */

/**
 * - Cotes 1X2 complètes et valides → probabilités implicites (marge retirée),
 *   λ ajustés sur ces probabilités, score exact = case max de la matrice.
 *   Le vainqueur et la confiance viennent directement du marché.
 * - Sinon → Double Poisson sur l'historique (null si historique insuffisant).
 */
export function calculateHybridPrediction(
  odds: PartialOdds | null | undefined,
  homeHistory: TeamHistory,
  awayHistory: TeamHistory,
  avgLeagueGoals: number = DEFAULT_AVG_LEAGUE_GOALS,
): Prediction | null {
  if (isCompleteOdds(odds)) {
    const implied = impliedProbabilities(odds);
    const fit = fitLambdasToOutcome(implied);
    return buildPrediction(fit.lambdaHome, fit.lambdaAway, implied, 'odds', {
      bookmakerMargin: pct(implied.margin),
    });
  }
  return calculateDoublePoisson(homeHistory, awayHistory, avgLeagueGoals);
}
