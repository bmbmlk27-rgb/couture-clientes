/**
 * Cotes 1X2 : type, validation, probabilités implicites et extraction depuis
 * les réponses Melbet / Xenvelop. Module pur, partagé par le front et par
 * les fonctions serverless (server/melbetProxy.ts).
 */

export interface Odds {
  home: number;
  draw: number;
  away: number;
}

/** Cotes partielles telles qu'elles peuvent arriver de l'API ou de la base. */
export type PartialOdds = Partial<Record<keyof Odds, number | null | undefined>>;

/** Une cote décimale valide est un nombre fini strictement supérieur à 1. */
const validOdd = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 1;

export function isCompleteOdds(o: PartialOdds | null | undefined): o is Odds {
  return !!o && validOdd(o.home) && validOdd(o.draw) && validOdd(o.away);
}

/**
 * Probabilités implicites sans la marge du bookmaker :
 * pᵢ = (1 / coteᵢ) / Σ(1 / cote), et marge = Σ(1 / cote) − 1.
 */
export function impliedProbabilities(o: Odds): { home: number; draw: number; away: number; margin: number } {
  const h = 1 / o.home;
  const d = 1 / o.draw;
  const a = 1 / o.away;
  const sum = h + d + a;
  return { home: h / sum, draw: d / sum, away: a / sum, margin: sum - 1 };
}

/* ------------------------------------------------------------------ */
/* Extraction du marché 1X2 dans une réponse Melbet                    */
/* ------------------------------------------------------------------ */

/**
 * Conventions de type observées dans le format Xenvelop/1xbet :
 *   groupe (G / groupId / marketId) 1 = marché 1X2
 *   type   (T / type / typeId)      1 = victoire domicile, 2 = nul, 3 = victoire extérieur
 *   cote   (C / coef / coefficient / odds)
 * La structure exacte varie selon les versions : on parcourt la réponse et on
 * retient le premier ensemble complet du groupe 1 (ou sans groupe déclaré).
 */
const MARKET_1X2 = 1;
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

export function extract1X2(data: unknown): Odds | null {
  // Ensembles de cotes collectées par groupe ("?" = groupe non déclaré)
  const sets = new Map<string, PartialOdds>();

  const add = (group: number | undefined, type: number, coef: number) => {
    if (group !== undefined && group !== MARKET_1X2) return;
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
    const ownGroup = first(node, GROUP_KEYS);
    const group = ownGroup ?? inheritedGroup;
    const type = first(node, TYPE_KEYS);
    const coef = first(node, COEF_KEYS);
    if (type !== undefined && coef !== undefined) add(group, type, coef);
    for (const v of Object.values(node)) {
      if (typeof v === 'object' && v !== null) walk(v, group, depth + 1);
    }
  };

  walk(data, undefined, 0);
  // Priorité au groupe 1 explicitement déclaré, sinon aux cotes sans groupe.
  for (const id of [String(MARKET_1X2), '?']) {
    const s = sets.get(id);
    if (isCompleteOdds(s)) return { home: s.home, draw: s.draw, away: s.away };
  }
  return null;
}

/** Cotes 1X2 d'un nœud « match » (undefined si absentes ou incomplètes). */
export function oddsFromGameNode(game: unknown): Odds | undefined {
  if (!isObj(game)) return undefined;
  return extract1X2(game) ?? undefined;
}
