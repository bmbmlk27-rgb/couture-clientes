/**
 * Cotes « vainqueur » d'un match : type, validation, probabilités implicites
 * et extraction depuis les réponses Melbet / Xenvelop. Module pur, partagé par
 * le front et par le relais serveur (server/melbetProxy.ts).
 *
 * Un match Penalty peut être coté en 1X2 (nul = égalité après les 5 tirs
 * réglementaires) ou en 2 issues (vainqueur final, mort subite comprise) :
 * `draw` est donc optionnel.
 */

export interface Odds {
  home: number;
  away: number;
  draw?: number;
}

/** Une cote décimale valide est un nombre fini strictement supérieur à 1. */
export const validOdd = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 1;

export function isValidOdds(o: Partial<Odds> | null | undefined): o is Odds {
  return !!o && validOdd(o.home) && validOdd(o.away) && (o.draw === undefined || validOdd(o.draw));
}

/**
 * Probabilités implicites sans la marge du bookmaker :
 * pᵢ = (1 / coteᵢ) / Σ(1 / cote), et marge = Σ(1 / cote) − 1.
 * `draw` vaut 0 pour un marché à 2 issues.
 */
export function impliedProbabilities(o: Odds): { home: number; draw: number; away: number; margin: number } {
  const h = 1 / o.home;
  const d = o.draw ? 1 / o.draw : 0;
  const a = 1 / o.away;
  const sum = h + d + a;
  return { home: h / sum, draw: d / sum, away: a / sum, margin: sum - 1 };
}

/* ------------------------------------------------------------------ */
/* Extraction dans une réponse Melbet                                  */
/* ------------------------------------------------------------------ */

/**
 * Conventions de type observées dans le format Xenvelop/1xbet :
 *   groupe (G / groupId / marketId) 1 = marché vainqueur (1X2)
 *   type   (T / type / typeId)      1 = victoire domicile, 2 = nul, 3 = victoire extérieur
 *   cote   (C / coef / coefficient / odds)
 * On parcourt la réponse et on retient le premier ensemble du groupe 1
 * (ou sans groupe déclaré) contenant au moins les cotes domicile et extérieur.
 */
const MARKET_WINNER = 1;
const TYPE_TO_KEY: Record<number, keyof Odds> = { 1: 'home', 2: 'draw', 3: 'away' };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};
const first = (o: Obj, keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined) return num(o[k]);
  return undefined;
};

const TYPE_KEYS = ['T', 'type', 'typeId', 't'];
const COEF_KEYS = ['C', 'coef', 'coefficient', 'odds', 'price', 'c'];
const GROUP_KEYS = ['G', 'group', 'groupId', 'marketId', 'market', 'g'];

export function extractOdds(data: unknown): Odds | null {
  const sets = new Map<string, Partial<Odds>>();

  const add = (group: number | undefined, type: number, coef: number) => {
    if (group !== undefined && group !== MARKET_WINNER) return;
    const key = TYPE_TO_KEY[type];
    if (!key || !validOdd(coef)) return;
    const id = group === undefined ? '?' : String(group);
    const set = sets.get(id) ?? {};
    if (set[key] === undefined) set[key] = coef; // la première cote rencontrée l'emporte
    sets.set(id, set);
  };

  const walk = (node: unknown, inheritedGroup: number | undefined, depth: number) => {
    if (depth > 12) return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n, inheritedGroup, depth + 1);
      return;
    }
    if (!isObj(node)) return;
    const group = first(node, GROUP_KEYS) ?? inheritedGroup;
    const type = first(node, TYPE_KEYS);
    const coef = first(node, COEF_KEYS);
    if (type !== undefined && coef !== undefined) add(group, type, coef);
    for (const v of Object.values(node)) {
      if (typeof v === 'object' && v !== null) walk(v, group, depth + 1);
    }
  };

  walk(data, undefined, 0);
  // Priorité au groupe 1 explicitement déclaré, sinon aux cotes sans groupe.
  for (const id of [String(MARKET_WINNER), '?']) {
    const s = sets.get(id);
    if (s && validOdd(s.home) && validOdd(s.away)) {
      return validOdd(s.draw) ? { home: s.home, draw: s.draw, away: s.away } : { home: s.home, away: s.away };
    }
  }
  return null;
}

/** Cotes d'un nœud « match » (undefined si absentes ou incomplètes). */
export function oddsFromGameNode(game: unknown): Odds | undefined {
  if (!isObj(game)) return undefined;
  return extractOdds(game) ?? undefined;
}
