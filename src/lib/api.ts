import type { Match, MatchStatus } from './types';
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

/**
 * L'API renvoie parfois 400 sur les paramètres de ligue/groupe : on essaie
 * des variantes de plus en plus minimales avant de basculer sur le fallback.
 */
const QUERY_VARIANTS = [
  'cfView=3&fcountry=96&gr=2710&lng=fr_FR&ref=8&sportIds=85&whence=22',
  'cfView=3&fcountry=96&lng=fr_FR&ref=8&sportIds=85&whence=22',
  'fcountry=96&lng=fr_FR&ref=8&sportIds=85',
];

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

/** Récupère les matchs ; renvoie `matches: null` si l'API est indisponible. */
export async function fetchMatches(): Promise<FetchResult> {
  const t0 = performance.now();
  let lastError = 'Erreur API';
  for (const qs of QUERY_VARIANTS) {
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/ChampsBySport?${qs}`, { headers: HEADERS });
      if (response.status === 400) {
        lastError = 'HTTP 400 (paramètres refusés)';
        continue; // variante suivante
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const matches = extractMatches(data);
      if (matches.length === 0) {
        lastError = 'Réponse vide';
        continue;
      }
      return { matches, latencyMs: Math.round(performance.now() - t0) };
    } catch (error) {
      lastError = error instanceof Error ? (error.name === 'AbortError' ? 'Délai dépassé' : error.message) : String(error);
      break; // erreur réseau / CORS : inutile d'insister
    }
  }
  console.warn(`API indisponible (${lastError}), utilisation des données locales.`);
  return { matches: null, error: lastError };
}

/* ------------------------------------------------------------------ */
/* Normalisation défensive : la structure exacte varie selon la version */
/* ------------------------------------------------------------------ */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : isObj(v) ? str(v.name ?? v.title ?? v.N) : undefined;

const VIRTUAL_RE = /fifa|fc\s?2\d|virtu|cyber|e-?sport|esoccer/i;

function teamNames(g: Obj): [string, string] | null {
  const pairs: [unknown, unknown][] = [
    [g.O1, g.O2], [g.opp1, g.opp2], [g.team1, g.team2], [g.home, g.away],
    [g.homeTeam, g.awayTeam], [g.O1E, g.O2E],
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
  for (const k of ['S', 'startTime', 'start', 'startDate', 'ts', 'date', 'dateStart']) {
    const v = g[k];
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) || Number(v) : NaN;
    if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n;
  }
  return Date.now();
}

function odds(g: Obj): Match['odds'] {
  const out: NonNullable<Match['odds']> = {};
  const events = Array.isArray(g.E) ? g.E : Array.isArray(g.events) ? g.events : [];
  for (const e of events) {
    if (!isObj(e)) continue;
    const type = Number(e.T ?? e.type);
    const c = Number(e.C ?? e.coef ?? e.coefficient);
    if (!Number.isFinite(c)) continue;
    if (type === 1) out.home = c;
    else if (type === 2) out.draw = c;
    else if (type === 3) out.away = c;
  }
  return Object.keys(out).length ? out : undefined;
}

function status(startsAt: number, g: Obj): MatchStatus {
  if (g.finished === true || g.isFinished === true) return 'finished';
  if (g.live === true || g.isLive === true) return 'live';
  const now = Date.now();
  if (startsAt > now) return 'upcoming';
  return now - startsAt < 10 * 60 * 1000 ? 'live' : 'finished';
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
      const id = String(node.I ?? node.id ?? node.gameId ?? `${names.join('-')}-${startsAt}`);
      if (!seen.has(id)) {
        seen.add(id);
        found.push({
          id,
          league: ownLeague || 'FC 26',
          home: resolveTeam(names[0]),
          away: resolveTeam(names[1]),
          startsAt,
          status: status(startsAt, node),
          odds: odds(node),
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
  const virtual = found.filter((m) => VIRTUAL_RE.test(m.league));
  return (virtual.length ? virtual : found).sort((a, b) => a.startsAt - b.startsAt);
}
