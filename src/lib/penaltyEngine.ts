/**
 * Moteur « séance de tirs au but » calé sur les cotes du bookmaker.
 *
 * Modèle : chaque équipe marque son tir avec une probabilité fixe
 * (pDom, pExt). Les équipes tirent en alternance, domicile en premier :
 *   1. Série réglementaire de 5 tirs chacune, arrêtée dès qu'une équipe ne
 *      peut plus être rattrapée (ex. 3-0 après 3 tirs chacune).
 *   2. En cas d'égalité : mort subite, un tir chacune par tour, jusqu'à ce
 *      qu'une seule des deux marque.
 * La distribution exacte de tous les scores finaux est calculée (pas de
 * simulation aléatoire).
 *
 * Calage sur les cotes :
 *   - cotes 1X2 : le nul = égalité après 5 tirs. On cherche (pDom, pExt) dont
 *     les probabilités « victoire dom. / égalité / victoire ext. après 5 tirs »
 *     collent le mieux au marché (moindres carrés).
 *   - cotes à 2 issues : vainqueur final. pDom = c + d, pExt = c − d avec
 *     c = BASE_CONVERSION, et d ajusté pour retrouver la probabilité du marché.
 */
import { impliedProbabilities, isValidOdds, type Odds } from './odds';

export const BASE_CONVERSION = 0.75;
const REGULATION_KICKS = 5;
const MAX_SUDDEN_DEATH_ROUNDS = 40;
const P_MIN = 0.2;
const P_MAX = 0.99;

export interface ShootoutResult {
  /** Probabilité de chaque score final, clé « dom-ext ». */
  scores: Map<string, number>;
  homeWin: number;
  awayWin: number;
  /** Probabilité que la séance aille en mort subite (égalité après 5 tirs). */
  suddenDeath: number;
  /** Issue après les 5 tirs réglementaires. */
  regulation: { home: number; draw: number; away: number };
}

export function simulateShootout(pHome: number, pAway: number): ShootoutResult {
  const scores = new Map<string, number>();
  const put = (h: number, a: number, p: number) => {
    const k = `${h}-${a}`;
    scores.set(k, (scores.get(k) ?? 0) + p);
  };
  let homeWin = 0;
  let awayWin = 0;
  let regHome = 0;
  let regAway = 0;

  // États actifs : (buts dom, buts ext) → probabilité
  let active = new Map<string, number>([['0-0', 1]]);
  for (let kick = 0; kick < 2 * REGULATION_KICKS; kick++) {
    const homeKicks = kick % 2 === 0;
    const p = homeKicks ? pHome : pAway;
    const next = new Map<string, number>();
    const kicksHome = Math.ceil((kick + 1) / 2); // tirs dom. effectués après ce tir
    const kicksAway = Math.floor((kick + 1) / 2);
    for (const [key, prob] of active) {
      const [h, a] = key.split('-').map(Number);
      for (const [scored, q] of [[1, p], [0, 1 - p]] as const) {
        if (q === 0) continue;
        const nh = h + (homeKicks ? scored : 0);
        const na = a + (homeKicks ? 0 : scored);
        const mass = prob * q;
        if (nh > na + (REGULATION_KICKS - kicksAway)) {
          put(nh, na, mass); homeWin += mass; regHome += mass;
        } else if (na > nh + (REGULATION_KICKS - kicksHome)) {
          put(nh, na, mass); awayWin += mass; regAway += mass;
        } else {
          const k = `${nh}-${na}`;
          next.set(k, (next.get(k) ?? 0) + mass);
        }
      }
    }
    active = next;
  }

  // Après 10 tirs, il ne reste que des égalités : mort subite.
  let suddenDeath = 0;
  const qBoth = pHome * pAway;
  const qNone = (1 - pHome) * (1 - pAway);
  const qHome = pHome * (1 - pAway);
  const qAway = (1 - pHome) * pAway;
  for (const [key, prob] of active) {
    const g = Number(key.split('-')[0]);
    suddenDeath += prob;
    // dist[j] : probabilité d'être encore à égalité après j tours « les deux marquent »
    let dist = [prob];
    for (let r = 0; r < MAX_SUDDEN_DEATH_ROUNDS; r++) {
      const nd = new Array<number>(dist.length + 1).fill(0);
      dist.forEach((m, j) => {
        if (m < 1e-12) return;
        put(g + j + 1, g + j, m * qHome); homeWin += m * qHome;
        put(g + j, g + j + 1, m * qAway); awayWin += m * qAway;
        nd[j] += m * qNone;
        nd[j + 1] += m * qBoth;
      });
      dist = nd;
    }
    // Masse résiduelle (négligeable) répartie au prorata des victoires d'un tour.
    const rest = dist.reduce((s, m) => s + m, 0);
    if (rest > 0 && qHome + qAway > 0) {
      homeWin += (rest * qHome) / (qHome + qAway);
      awayWin += (rest * qAway) / (qHome + qAway);
    }
  }

  return {
    scores,
    homeWin,
    awayWin,
    suddenDeath,
    regulation: { home: regHome, draw: suddenDeath, away: regAway },
  };
}

/* ------------------------------------------------------------------ */
/* Calage sur les cotes                                                */
/* ------------------------------------------------------------------ */

const clampP = (p: number) => Math.min(P_MAX, Math.max(P_MIN, p));

/**
 * Version allégée de simulateShootout, limitée aux 5 tirs réglementaires
 * (utilisée des milliers de fois pendant le calage) : [dom., égalité, ext.].
 */
export function regulationOutcome(pHome: number, pAway: number): [number, number, number] {
  const N = REGULATION_KICKS + 1;
  let cur = new Float64Array(N * N);
  cur[0] = 1;
  let home = 0;
  let away = 0;
  for (let kick = 0; kick < 2 * REGULATION_KICKS; kick++) {
    const homeKicks = kick % 2 === 0;
    const p = homeKicks ? pHome : pAway;
    const leftHome = REGULATION_KICKS - Math.ceil((kick + 1) / 2);
    const leftAway = REGULATION_KICKS - Math.floor((kick + 1) / 2);
    const next = new Float64Array(N * N);
    for (let h = 0; h < N; h++) {
      for (let a = 0; a < N; a++) {
        const m = cur[h * N + a];
        if (m === 0) continue;
        for (let scored = 0; scored <= 1; scored++) {
          const mass = m * (scored ? p : 1 - p);
          const nh = h + (homeKicks ? scored : 0);
          const na = a + (homeKicks ? 0 : scored);
          if (nh > na + leftAway) home += mass;
          else if (na > nh + leftHome) away += mass;
          else next[nh * N + na] += mass;
        }
      }
    }
    cur = next;
  }
  return [home, 1 - home - away, away];
}

/** Marché à 2 issues : d tel que P(victoire dom.) = cible, avec pDom = c + d, pExt = c − d. */
function fitTwoWay(targetHome: number): [number, number] {
  const c = BASE_CONVERSION;
  const span = Math.min(P_MAX - c, c - P_MIN);
  let lo = -span;
  let hi = span;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (simulateShootout(c + mid, c - mid).homeWin < targetHome) lo = mid;
    else hi = mid;
  }
  const d = (lo + hi) / 2;
  return [clampP(c + d), clampP(c - d)];
}

/** Marché 1X2 (nul = égalité après 5 tirs) : moindres carrés sur une grille affinée. */
function fitThreeWay(target: { home: number; draw: number; away: number }): [number, number] {
  const err = (ph: number, pa: number) => {
    const [h, d, a] = regulationOutcome(ph, pa);
    return (h - target.home) ** 2 + (d - target.draw) ** 2 + (a - target.away) ** 2;
  };
  let best: [number, number] = [BASE_CONVERSION, BASE_CONVERSION];
  let bestErr = Infinity;
  const scan = (h0: number, h1: number, a0: number, a1: number, step: number) => {
    for (let ph = h0; ph <= h1 + 1e-9; ph += step) {
      for (let pa = a0; pa <= a1 + 1e-9; pa += step) {
        const e = err(ph, pa);
        if (e < bestErr) { bestErr = e; best = [ph, pa]; }
      }
    }
  };
  scan(P_MIN, P_MAX, P_MIN, P_MAX, 0.03);
  for (const step of [0.006, 0.0012]) {
    const [h, a] = best;
    const w = step * 5;
    scan(clampP(h - w), clampP(h + w), clampP(a - w), clampP(a + w), step);
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Prédiction affichée                                                  */
/* ------------------------------------------------------------------ */

export type Side = 'home' | 'away';

export interface ScoreProbability {
  score: string; // « 5 - 4 »
  probability: number; // %
  winner: Side;
}

export interface PenaltyPrediction {
  /** Vainqueur final le plus probable (mort subite comprise). */
  winner: Side;
  /** Probabilité (en %) que `winner` gagne. */
  confidence: number;
  probabilities: { home: number; away: number };
  /** Scores finaux les plus probables (3 premiers), en %. */
  topScores: ScoreProbability[];
  /** Probabilité (en %) d'aller en mort subite. */
  suddenDeath: number;
  /** Réussite estimée de chaque équipe par tir, en %. */
  conversion: { home: number; away: number };
  /** Marge du bookmaker en %. */
  bookmakerMargin: number;
  /** 1X2 (nul = égalité après 5 tirs) ou 2 issues. */
  market: '1X2' | '12';
}

const pct = (p: number) => Math.round(p * 1000) / 10;

export function predictPenalty(odds: Odds | null | undefined): PenaltyPrediction | null {
  if (!isValidOdds(odds)) return null;
  const implied = impliedProbabilities(odds);
  const threeWay = odds.draw !== undefined;
  const [ph, pa] = threeWay ? fitThreeWay(implied) : fitTwoWay(implied.home);
  const r = simulateShootout(ph, pa);

  const topScores = [...r.scores.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 3)
    .map(([k, p]) => {
      const [h, a] = k.split('-').map(Number);
      return { score: `${h} - ${a}`, probability: pct(p), winner: (h > a ? 'home' : 'away') as Side };
    });

  const winner: Side = r.homeWin >= r.awayWin ? 'home' : 'away';
  return {
    winner,
    confidence: pct(winner === 'home' ? r.homeWin : r.awayWin),
    probabilities: { home: pct(r.homeWin), away: pct(r.awayWin) },
    topScores,
    suddenDeath: pct(r.suddenDeath),
    conversion: { home: pct(ph), away: pct(pa) },
    bookmakerMargin: pct(implied.margin),
    market: threeWay ? '1X2' : '12',
  };
}
