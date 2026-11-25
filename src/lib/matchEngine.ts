/**
 * Moteur « match classique » (championnats FIFA virtuels hors Penalty) :
 * Poisson calé sur les cotes 1X2.
 *
 * 1. Probabilités implicites des cotes, marge du bookmaker retirée.
 * 2. On cherche les buts attendus (λ dom., λ ext.) dont les probabilités
 *    Poisson 1/N/2 collent le mieux au marché (moindres carrés, grille affinée).
 * 3. Vainqueur et confiance = probabilités du marché ; score exact et mi-temps
 *    = cases les plus probables de la matrice de Poisson.
 * Grille de scores jusqu’à 25 buts : couvre les formats à beaucoup de buts
 * (3x3, 4x4, 5x5 Rush).
 */
import { impliedProbabilities, isValidOdds, type Odds } from './odds';

export type Winner = 'Domicile' | 'Extérieur' | 'Match Nul';

export interface MatchPrediction {
  winner: Winner;
  /** Probabilité (en %) de l'issue `winner`. */
  confidence: number;
  halfTimeScore: string;
  fullTimeScore: string;
  fullTimeScoreProbability: number;
  /** Probabilités 1 / N / 2 en %. */
  probabilities: { home: number; draw: number; away: number };
  lambdaHome: number;
  lambdaAway: number;
  /** `false` si le score exact le plus probable ne désigne pas `winner`. */
  scoreMatchesWinner: boolean;
  bookmakerMargin: number;
}

export const HALF_TIME_SHARE = 0.45;
const MAX_GOALS = 25;
const LAMBDA_MIN = 0.05;
const LAMBDA_MAX = 14;

const FACTORIALS = Array.from({ length: MAX_GOALS + 1 }, (_, n) => {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
});
const poisson = (k: number, lambda: number) => (Math.pow(lambda, k) * Math.exp(-lambda)) / FACTORIALS[k];
const vector = (l: number) => FACTORIALS.map((_, k) => poisson(k, l));
const pct = (p: number) => Math.round(p * 1000) / 10;

function outcome(ph: number[], pa: number[]) {
  let home = 0, draw = 0, away = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const v = ph[i] * pa[j];
      if (i > j) home += v; else if (i === j) draw += v; else away += v;
    }
  }
  const t = home + draw + away;
  return { home: home / t, draw: draw / t, away: away / t };
}

export function fitLambdasToOutcome(target: { home: number; draw: number; away: number }) {
  const range = (lo: number, hi: number, step: number) => {
    const out: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += step) out.push(v);
    return out;
  };
  let best = { lambdaHome: 1, lambdaAway: 1, error: Infinity };
  const scan = (h0: number, h1: number, a0: number, a1: number, step: number) => {
    const hs = range(h0, h1, step);
    const as = range(a0, a1, step);
    const hv = hs.map(vector);
    const av = as.map(vector);
    for (let x = 0; x < hs.length; x++) {
      for (let y = 0; y < as.length; y++) {
        const o = outcome(hv[x], av[y]);
        const e = (o.home - target.home) ** 2 + (o.draw - target.draw) ** 2 + (o.away - target.away) ** 2;
        if (e < best.error) best = { lambdaHome: hs[x], lambdaAway: as[y], error: e };
      }
    }
  };
  scan(LAMBDA_MIN, LAMBDA_MAX, LAMBDA_MIN, LAMBDA_MAX, 0.15);
  for (const step of [0.03, 0.006, 0.0012]) {
    const r = step * 6;
    const { lambdaHome: h, lambdaAway: a } = best;
    scan(Math.max(LAMBDA_MIN, h - r), Math.min(LAMBDA_MAX, h + r), Math.max(LAMBDA_MIN, a - r), Math.min(LAMBDA_MAX, a + r), step);
  }
  return best;
}

function bestScore(ph: number[], pa: number[]) {
  let best = { home: 0, away: 0, prob: -1 };
  let total = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = ph[i] * pa[j];
      total += p;
      if (p > best.prob) best = { home: i, away: j, prob: p };
    }
  }
  return { ...best, prob: best.prob / total };
}

const winnerOf = (h: number, a: number): Winner => (h > a ? 'Domicile' : h < a ? 'Extérieur' : 'Match Nul');

/** Prédiction d'un match classique ; null sans cotes 1X2 complètes (le nul est indispensable). */
export function predictMatch(odds: Odds | null | undefined): MatchPrediction | null {
  if (!isValidOdds(odds) || odds.draw === undefined) return null;
  const implied = impliedProbabilities(odds);
  const { lambdaHome, lambdaAway } = fitLambdasToOutcome(implied);
  const ft = bestScore(vector(lambdaHome), vector(lambdaAway));
  const ht = bestScore(vector(lambdaHome * HALF_TIME_SHARE), vector(lambdaAway * HALF_TIME_SHARE));

  let winner: Winner = 'Match Nul';
  let max = implied.draw;
  if (implied.home > max) { winner = 'Domicile'; max = implied.home; }
  if (implied.away > max) { winner = 'Extérieur'; max = implied.away; }

  return {
    winner,
    confidence: pct(max),
    halfTimeScore: `${ht.home} - ${ht.away}`,
    fullTimeScore: `${ft.home} - ${ft.away}`,
    fullTimeScoreProbability: pct(ft.prob),
    probabilities: { home: pct(implied.home), draw: pct(implied.draw), away: pct(implied.away) },
    lambdaHome: Math.round(lambdaHome * 100) / 100,
    lambdaAway: Math.round(lambdaAway * 100) / 100,
    scoreMatchesWinner: winnerOf(ft.home, ft.away) === winner,
    bookmakerMargin: pct(implied.margin),
  };
}
