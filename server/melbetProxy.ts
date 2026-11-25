/**
 * Relais vers l'API Melbet / Xenvelop, partagé par les fonctions serverless
 * Vercel (`api/melbet.ts`), Netlify (`netlify/functions/melbet.ts`) et le
 * serveur de développement Vite (`vite.config.ts`).
 *
 * Deux routes :
 *   /api/melbet/ChampsBySport?…   → liste des matchs (réponse brute Melbet)
 *   /api/melbet-odds?gameId=123   → GetGame, réduit aux cotes vainqueur :
 *                                   { home, away, draw? } (draw absent si marché à 2 issues)
 *   /api/melbet-odds?gameId=123&debug=1 → réponse GetGame brute (diagnostic)
 * Les en-têtes Melbet (impossibles à envoyer depuis un navigateur) sont
 * ajoutés ici.
 */
import { extractOdds } from '../src/lib/odds';

export const MELBET_ORIGIN = 'https://n4vkteatv6x0.com/MainFeedLive/mobile/v3';

export const MELBET_HEADERS: Record<string, string> = {
  accept: 'application/vnd.xenvelop+json',
  'x-language': 'fr_FR',
  'x-bundleid': 'org.melbet.vac',
  appguid: '7c961562a8f43193_2',
  'x-fcountry': '96',
  'user-agent': 'org.melbet.vac-user-agent/melbet-v258.0.5',
  version: 'melbet-v258.0.5',
};

/** Seuls ces endpoints sont relayés : la fonction n'est pas un proxy ouvert. */
export const ALLOWED_ENDPOINTS = new Set(['ChampsBySport']);

const TIMEOUT_MS = 8000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/** Extrait le nom de l'endpoint : `?path=` (réécriture Vercel) ou `/…/melbet/<endpoint>` (Netlify). */
export function endpointFrom(url: URL): string {
  const fromQuery = url.searchParams.get('path');
  if (fromQuery) return fromQuery.replace(/^\/+|\/+$/g, '');
  const m = url.pathname.match(/\/melbet\/(.+?)\/?$/);
  return m ? m[1] : '';
}

export async function handleMelbetRequest(request: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'GET') return json(405, { error: 'Méthode non autorisée' });

  const url = new URL(request.url);
  const endpoint = endpointFrom(url);
  if (!ALLOWED_ENDPOINTS.has(endpoint)) return json(404, { error: `Endpoint non relayé : ${endpoint || '(vide)'}` });

  const query = new URLSearchParams(url.searchParams);
  query.delete('path');
  const target = `${MELBET_ORIGIN}/${endpoint}${query.size ? `?${query}` : ''}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetchImpl(target, { headers: MELBET_HEADERS, signal: ctrl.signal });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status, // un 400 de Melbet est renvoyé tel quel : le front essaiera la variante suivante
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        // Cache CDN court : limite les appels à Melbet quand beaucoup de visiteurs sont connectés.
        'cache-control': upstream.ok ? 'public, s-maxage=15, stale-while-revalidate=30' : 'no-store',
      },
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return json(aborted ? 504 : 502, { error: aborted ? 'Délai dépassé côté Melbet' : 'API Melbet injoignable' });
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Route /api/melbet-odds : cotes 1X2 d'un match (GetGame)             */
/* ------------------------------------------------------------------ */

/** Paramètres fixes de GetGame (seul gameId varie). */
export const GET_GAME_PARAMS = 'cfView=3&fcountry=96&gr=2710&lng=fr_FR&ref=8&whence=22';

export async function handleMelbetOddsRequest(request: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'GET') return json(405, { error: 'Méthode non autorisée' });

  const params = new URL(request.url).searchParams;
  const gameId = params.get('gameId') ?? '';
  const debug = params.get('debug') === '1';
  if (!/^\d{1,15}$/.test(gameId)) return json(400, { error: 'Paramètre gameId manquant ou invalide (entier attendu)' });

  const target = `${MELBET_ORIGIN}/GetGame?gameId=${gameId}&${GET_GAME_PARAMS}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetchImpl(target, { headers: MELBET_HEADERS, signal: ctrl.signal });
    if (!upstream.ok) {
      return json(502, { error: `Melbet a répondu HTTP ${upstream.status}`, upstreamStatus: upstream.status });
    }
    if (debug) {
      return new Response(await upstream.text(), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    let data: unknown;
    try {
      data = await upstream.json();
    } catch {
      return json(502, { error: 'Réponse Melbet illisible (JSON invalide)' });
    }
    const odds = extractOdds(data);
    if (!odds) return json(404, { error: 'Cotes vainqueur indisponibles pour ce match' });
    return new Response(JSON.stringify(odds), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, s-maxage=20, stale-while-revalidate=40',
      },
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return json(aborted ? 504 : 502, { error: aborted ? 'Délai dépassé côté Melbet' : 'API Melbet injoignable' });
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Diagnostic : /api/melbet-odds?probe=1                               */
/* ------------------------------------------------------------------ */

/**
 * Prend le prochain match Penalty de ChampsBySport et essaie plusieurs
 * variantes d'appel des cotes, en renvoyant statut et début de réponse de
 * chacune. Les identifiants viennent de Melbet lui-même (aucune entrée
 * utilisateur dans les URL appelées).
 */
const CHAMPS_QUERY = 'cfView=3&fcountry=96&gr=2710&lng=fr_FR&ref=8&sportIds=85&whence=22';
const PROBE_BODY_CHARS = 4000;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Matchs des ligues Penalty : [{ id, league, label, nonStarted }]. */
export function penaltyGames(data: unknown): { id: number; league: string; label: string; nonStarted: unknown }[] {
  const out: { id: number; league: string; label: string; nonStarted: unknown }[] = [];
  const walk = (node: unknown, depth: number) => {
    if (depth > 8) return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    if (!isObj(node)) return;
    if (Array.isArray(node.games) && typeof node.name === 'string' && /penalt/i.test(node.name)) {
      for (const g of node.games) {
        if (!isObj(g) || typeof g.id !== 'number') continue;
        const name = (o: unknown) => (isObj(o) && typeof o.fullName === 'string' ? o.fullName : '?');
        out.push({ id: g.id, league: node.name, label: `${name(g.opponent1)} - ${name(g.opponent2)}`, nonStarted: g.nonStarted });
      }
    }
    for (const v of Object.values(node)) if (typeof v === 'object') walk(v, depth + 1);
  };
  walk(data, 0);
  return out;
}

export async function handleMelbetProbe(fetchImpl: typeof fetch = fetch): Promise<Response> {
  const call = async (url: string) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetchImpl(url, { headers: MELBET_HEADERS, signal: ctrl.signal });
      const body = await r.text();
      return { url, status: r.status, length: body.length, body: body.slice(0, PROBE_BODY_CHARS) };
    } catch (e) {
      return { url, status: 0, error: e instanceof Error ? e.message : String(e) };
    } finally {
      clearTimeout(timer);
    }
  };

  const list = await call(`${MELBET_ORIGIN}/ChampsBySport?${CHAMPS_QUERY}`);
  let games: ReturnType<typeof penaltyGames> = [];
  try {
    games = penaltyGames(JSON.parse(list.body ?? ''));
  } catch {
    /* réponse illisible : signalée ci-dessous */
  }
  const game = games.find((g) => g.nonStarted === true) ?? games[0];
  if (!game) {
    return json(200, { error: 'Aucun match Penalty dans ChampsBySport', champsBySport: { status: list.status, body: list.body?.slice(0, 500) } });
  }

  const id = game.id;
  const root = MELBET_ORIGIN.replace(/\/MainFeedLive\//, '/');
  const variants = [
    `${MELBET_ORIGIN}/GetGame?gameId=${id}&${GET_GAME_PARAMS}`,
    `${MELBET_ORIGIN}/GetGame?gameId=${id}`,
    `${MELBET_ORIGIN}/GetGame?id=${id}&${GET_GAME_PARAMS}`,
    `${root.replace('/mobile/v3', '')}/LineFeed/mobile/v3/GetGame?gameId=${id}&${GET_GAME_PARAMS}`,
    `${root.replace('/mobile/v3', '')}/LiveFeed/mobile/v3/GetGame?gameId=${id}&${GET_GAME_PARAMS}`,
  ];
  const attempts = await Promise.all(variants.map(call));
  return json(200, { game, otherPenaltyGames: games.length - 1, attempts });
}

/* ------------------------------------------------------------------ */
/* Route /api/melbet-league?champId=… : matchs d'un championnat         */
/* ------------------------------------------------------------------ */

/**
 * ChampsBySport ne détaille les matchs que d'un seul championnat. Pour les
 * autres, on essaie plusieurs requêtes plausibles (l'API n'est pas documentée)
 * et on retient, pour la durée de vie du Worker, la première qui renvoie bien
 * des matchs de CE championnat.
 */
const MELBET_HOST = MELBET_ORIGIN.replace(/\/MainFeedLive\/mobile\/v3$/, '');
export const LEAGUE_VARIANTS: ((id: string) => string)[] = [
  (id) => `${MELBET_ORIGIN}/ChampsBySport?${CHAMPS_QUERY}&champIds=${id}`,
  (id) => `${MELBET_ORIGIN}/ChampsBySport?${CHAMPS_QUERY}&champId=${id}`,
  (id) => `${MELBET_ORIGIN}/ChampsBySport?${CHAMPS_QUERY}&ligaId=${id}`,
  (id) => `${MELBET_ORIGIN}/GetChampGames?champId=${id}&${GET_GAME_PARAMS}`,
  (id) => `${MELBET_ORIGIN}/GamesByChamp?champId=${id}&${GET_GAME_PARAMS}`,
  (id) => `${MELBET_ORIGIN}/Games?champIds=${id}&${CHAMPS_QUERY}`,
  (id) => `${MELBET_ORIGIN}/GetChamp?champId=${id}&${GET_GAME_PARAMS}`,
  (id) => `${MELBET_HOST}/LineFeed/mobile/v3/ChampsBySport?${CHAMPS_QUERY}&champIds=${id}`,
];

/** La réponse contient-elle des matchs du championnat `id` ? */
export function hasLeagueGames(data: unknown, id: number): boolean {
  let found = false;
  const walk = (node: unknown, depth: number) => {
    if (found || depth > 10) return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    if (!isObj(node)) return;
    if (Number(node.id) === id && Array.isArray(node.games) && node.games.length > 0) { found = true; return; }
    if (Number(node.champId ?? node.leagueId ?? node.ligaId) === id && (node.opponent1 || node.O1)) { found = true; return; }
    for (const v of Object.values(node)) if (typeof v === 'object') walk(v, depth + 1);
  };
  walk(data, 0);
  return found;
}

let workingLeagueVariant: number | null = null;
let noVariantUntil = 0;
const NO_VARIANT_RETRY_MS = 5 * 60_000;

/** Pour les tests. */
export function resetLeagueDiscovery() {
  workingLeagueVariant = null;
  noVariantUntil = 0;
}

export async function handleMelbetLeagueRequest(request: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'GET') return json(405, { error: 'Méthode non autorisée' });
  const params = new URL(request.url).searchParams;
  const champId = params.get('champId') ?? '';
  const debug = params.get('debug') === '1';
  if (!/^\d{1,12}$/.test(champId)) return json(400, { error: 'Paramètre champId manquant ou invalide (entier attendu)' });
  if (!debug && workingLeagueVariant === null && Date.now() < noVariantUntil) {
    return json(404, { error: 'Aucune requête Melbet connue ne renvoie les matchs de ce championnat' });
  }

  const order = workingLeagueVariant === null || debug
    ? LEAGUE_VARIANTS.map((_, i) => i)
    : [workingLeagueVariant];
  const attempts: { variant: number; url: string; status: number; body?: string }[] = [];
  for (const i of order) {
    const url = LEAGUE_VARIANTS[i](champId);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetchImpl(url, { headers: MELBET_HEADERS, signal: ctrl.signal });
      const body = await r.text();
      attempts.push({ variant: i, url, status: r.status, ...(debug ? { body: body.slice(0, 1500) } : {}) });
      if (!r.ok) continue;
      let data: unknown;
      try { data = JSON.parse(body); } catch { continue; }
      if (!hasLeagueGames(data, Number(champId))) continue;
      workingLeagueVariant = i;
      if (debug) continue; // en diagnostic, on teste toutes les variantes
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'public, s-maxage=15, stale-while-revalidate=30',
          'x-melbet-variant': String(i),
        },
      });
    } catch (e) {
      attempts.push({ variant: i, url, status: 0, body: e instanceof Error ? e.message : String(e) });
    } finally {
      clearTimeout(timer);
    }
  }
  if (debug) return json(200, { champId, workingVariant: workingLeagueVariant, attempts });
  // La variante retenue a cessé de marcher : on relancera la découverte.
  if (order.length === 1) workingLeagueVariant = null;
  else noVariantUntil = Date.now() + NO_VARIANT_RETRY_MS;
  return json(404, { error: 'Matchs de ce championnat indisponibles', attempts: attempts.map(({ variant, status }) => ({ variant, status })) });
}

/* ------------------------------------------------------------------ */
/* Aiguillage commun                                                   */
/* ------------------------------------------------------------------ */

/** Route vers les cotes si `?route=odds` (réécriture Vercel) ou chemin `/melbet-odds`. */
export function isOddsRoute(url: URL): boolean {
  return url.searchParams.get('route') === 'odds' || /\/melbet-odds\/?$/.test(url.pathname);
}

export function handleMelbet(request: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.get('route') === 'league' || /\/melbet-league\/?$/.test(url.pathname)) {
    return handleMelbetLeagueRequest(request, fetchImpl);
  }
  if (isOddsRoute(url) && url.searchParams.get('probe') === '1') return handleMelbetProbe(fetchImpl);
  return isOddsRoute(url)
    ? handleMelbetOddsRequest(request, fetchImpl)
    : handleMelbetRequest(request, fetchImpl);
}
