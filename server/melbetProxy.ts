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
/* Aiguillage commun                                                   */
/* ------------------------------------------------------------------ */

/** Route vers les cotes si `?route=odds` (réécriture Vercel) ou chemin `/melbet-odds`. */
export function isOddsRoute(url: URL): boolean {
  return url.searchParams.get('route') === 'odds' || /\/melbet-odds\/?$/.test(url.pathname);
}

export function handleMelbet(request: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  return isOddsRoute(new URL(request.url))
    ? handleMelbetOddsRequest(request, fetchImpl)
    : handleMelbetRequest(request, fetchImpl);
}
