import type { Match, MatchStatus } from './types';
import { isValidOdds, oddsFromGameNode, type Odds } from './odds';
import { resolveTeam } from '../data/teams';

/** Configuration d'origine de l'API Melbet / Xenvelop. */
export const API_ORIGIN_URL = 'https://n4vkteatv6x0.com/MainFeedLive/mobile/v3';

/**
 * URL réellement appelée par le navigateur. Par défaut le proxy Vite
 * (`/api/melbet` → API_ORIGIN_URL, avec en-têtes injectés côté serveur).
 * Surcharger avec VITE_API_BASE_URL pour pointer vers votre propre backend.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api/melbet';

export const HEADERS: Record<string, string> = {
  accept: 'application/vnd.xenvelop+json',
  'x-language': 'fr_FR',
  'x-bundleid': 'org.melbet.vac',
  appguid: '7c961562a8f43193_2',
  'x-fcountry': '96',
  'user-agent': 'org.melbet.vac-user-agent/melbet-v258.0.5',
  version: 'melbet-v258.0.5',
};

/** Requête FIFA (sportIds=85). Sans `gr=2710`, Melbet répond 400. */
export const CHAMPS_QUERY = 'cfView=3&fcountry=96&gr=2710&lng=fr_FR&ref=8&sportIds=85&whence=22';

const TIMEOUT_MS = 8000;

export interface FetchResult {
  matches: Match[] | null;
  error?: string;
  latencyMs?: number;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Récupère les matchs Penalty ; `matches: null` si l'API est indisponible. */
export async function fetchMatches(): Promise<FetchResult> {
  const t0 = performance.now();
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/ChampsBySport?${CHAMPS_QUERY}`, { headers: HEADERS });
    if (!response.ok) return { matches: null, error: `HTTP ${response.status}` };
    const matches = extractMatches(await response.json());
    return { matches, latencyMs: Math.round(performance.now() - t0) };
  } catch (error) {
    const msg = error instanceof Error ? (error.name === 'AbortError' ? 'Délai dépassé' : error.message) : String(error);
    return { matches: null, error: msg };
  }
}

/* ------------------------------------------------------------------ */
/* Normalisation défensive : la structure exacte varie selon la version */
/* ------------------------------------------------------------------ */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : isObj(v) ? str(v.fullName ?? v.name ?? v.title ?? v.N) : undefined;

/** Ligues de séances de tirs au but (« FC25. Penalty », « FIFA23. Penalty », « Penalty »…). */
export const PENALTY_RE = /penalt/i;

function teamNames(g: Obj): [string, string] | null {
  const pairs: [unknown, unknown][] = [
    [g.O1, g.O2], [g.opp1, g.opp2], [g.team1, g.team2], [g.home, g.away],
    [g.homeTeam, g.awayTeam], [g.O1E, g.O2E],
    // Format mobile v3 : opponent1: { fullName, opps: [...] }
    [g.opponent1, g.opponent2],
  ];
  if (Array.isArray(g.teams) && g.teams.length >= 2) pairs.push([g.teams[0], g.teams[1]]);
  if (Array.isArray(g.opponents) && g.opponents.length >= 2) pairs.push([g.opponents[0], g.opponents[1]]);
  for (const [a, b] of pairs) {
    const na = str(a);
    const nb = str(b);
    if (na && nb) return [na, nb];
  }
  return null;
}

function timestamp(g: Obj): number {
  for (const k of ['S', 'startTs', 'startTime', 'start', 'startDate', 'ts', 'date', 'dateStart']) {
    const v = g[k];
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) || Number(v) : NaN;
    if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n;
  }
  return Date.now();
}

function status(startsAt: number, g: Obj): MatchStatus {
  if (g.finished === true || g.isFinished === true) return 'finished';
  if (g.live === true || g.isLive === true) return 'live';
  if (g.nonStarted === true) return 'upcoming';
  if (g.nonStarted === false) return 'live';
  const now = Date.now();
  if (startsAt > now) return 'upcoming';
  return now - startsAt < 10 * 60 * 1000 ? 'live' : 'finished';
}

/** Score en cours (« 3-2 ») d'un match commencé. */
function liveScore(g: Obj): string | undefined {
  if (g.nonStarted !== false || !isObj(g.scores)) return undefined;
  const { scoreOpp1, scoreOpp2 } = g.scores;
  return typeof scoreOpp1 === 'number' && typeof scoreOpp2 === 'number' ? `${scoreOpp1} - ${scoreOpp2}` : undefined;
}

export function extractMatches(data: unknown): Match[] {
  const found: Match[] = [];
  const seen = new Set<string>();

  const walk = (node: unknown, league: string, depth: number) => {
    if (depth > 8) return;
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, league, depth + 1));
      return;
    }
    if (!isObj(node)) return;
    const ownLeague = str(node.L ?? node.champName ?? node.leagueName ?? node.ligaName) ?? league;
    const names = teamNames(node);
    if (names) {
      const startsAt = timestamp(node);
      const rawId = node.I ?? node.id ?? node.gameId;
      const id = String(rawId ?? `${names.join('-')}-${startsAt}`);
      if (!seen.has(id)) {
        seen.add(id);
        found.push({
          id,
          league: ownLeague || 'FC 26',
          home: resolveTeam(names[0]),
          away: resolveTeam(names[1]),
          startsAt,
          status: status(startsAt, node),
          odds: oddsFromGameNode(node),
          // Identifiant Melbet numérique : nécessaire pour /api/melbet-odds (GetGame)
          apiGameId: /^\d+$/.test(String(rawId ?? '')) ? String(rawId) : undefined,
          liveScore: liveScore(node),
        });
      }
      return;
    }
    // Pour un conteneur de ligue, son propre nom devient le contexte des enfants.
    const ctx = isObj(node) && (Array.isArray(node.games) || Array.isArray(node.G))
      ? str(node.name ?? node.title ?? node.L) ?? ownLeague
      : ownLeague;
    for (const v of Object.values(node)) if (typeof v === 'object') walk(v, ctx, depth + 1);
  };

  walk(data, '', 0);
  return found.filter((m) => PENALTY_RE.test(m.league)).sort((a, b) => a.startsAt - b.startsAt);
}

/* ------------------------------------------------------------------ */
/* Cotes 1X2 via /api/melbet-odds (GetGame)                            */
/* ------------------------------------------------------------------ */

export const ODDS_URL: string = import.meta.env.VITE_ODDS_URL ?? '/api/melbet-odds';
const ODDS_TTL_MS = 20_000;
const ODDS_TIMEOUT_MS = 5000;
const ODDS_CONCURRENCY = 4;
const ODDS_MAX_GAMES = 30;

const oddsCache = new Map<string, { at: number; odds: Odds | null }>();

/** Cotes vainqueur d'un match Melbet, ou null (absentes, erreur, délai dépassé). */
export async function fetchOdds(gameId: string): Promise<Odds | null> {
  const cached = oddsCache.get(gameId);
  if (cached && Date.now() - cached.at < ODDS_TTL_MS) return cached.odds;
  let odds: Odds | null = null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ODDS_TIMEOUT_MS);
  try {
    const res = await fetch(`${ODDS_URL}?gameId=${encodeURIComponent(gameId)}`, { signal: ctrl.signal });
    if (res.ok) {
      const body = await res.json();
      odds = isValidOdds(body) ? body : null;
    }
  } catch {
    odds = null;
  } finally {
    clearTimeout(t);
  }
  oddsCache.set(gameId, { at: Date.now(), odds });
  return odds;
}

/**
 * Complète les cotes manquantes des matchs non terminés (4 requêtes en
 * parallèle, 30 matchs max). Un échec laisse simplement le match sans cotes :
 * la carte indique alors « cotes indisponibles ».
 */
export async function enrichWithOdds(matches: Match[]): Promise<Match[]> {
  const todo = matches
    .filter((m) => m.apiGameId && m.status !== 'finished' && !isValidOdds(m.odds))
    .slice(0, ODDS_MAX_GAMES);
  const found = new Map<string, Odds>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < todo.length) {
      const m = todo[cursor++];
      const odds = await fetchOdds(m.apiGameId!);
      if (odds) found.set(m.id, odds);
    }
  };
  await Promise.all(Array.from({ length: Math.min(ODDS_CONCURRENCY, todo.length) }, worker));
  return found.size ? matches.map((m) => (found.has(m.id) ? { ...m, odds: found.get(m.id) } : m)) : matches;
}
