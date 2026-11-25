import { sameTeam } from '../data/teams';
import { isCompleteOdds } from './odds';
import type { Match } from './types';

/** Deux matchs à moins de 30 min d'écart avec les mêmes équipes = le même match. */
const SAME_MATCH_WINDOW_MS = 30 * 60 * 1000;

function isSameFixture(a: Match, b: Match): boolean {
  return (
    sameTeam(a.home.name, b.home.name) &&
    sameTeam(a.away.name, b.away.name) &&
    Math.abs(a.startsAt - b.startsAt) <= SAME_MATCH_WINDOW_MS
  );
}

/**
 * Fusionne les matchs de l'API Melbet et ceux saisis dans /admin.
 * - Un match présent des deux côtés n'apparaît qu'une fois (version API) ;
 *   s'il n'a pas de cotes côté API, il reprend les cotes saisies à la main.
 * - Les matchs saisis absents de l'API sont ajoutés : la page publique reste
 *   alimentée même quand Melbet bloque le serveur.
 */
export function mergeFixtures(apiMatches: Match[], dbMatches: Match[]): Match[] {
  const merged: Match[] = apiMatches.map((m) => ({ ...m, origin: m.origin ?? 'api' }));
  for (const db of dbMatches) {
    const idx = merged.findIndex((m) => isSameFixture(m, db));
    if (idx === -1) {
      merged.push(db);
    } else if (!isCompleteOdds(merged[idx].odds) && isCompleteOdds(db.odds)) {
      merged[idx] = { ...merged[idx], odds: db.odds };
    }
  }
  return merged.sort((a, b) => a.startsAt - b.startsAt);
}
