import type { Match, MatchStatus } from './types';

/**
 * Mémoire des matchs vus dans les réponses Melbet.
 *
 * ChampsBySport ne détaille les matchs que d'un seul championnat à la fois
 * (il change d'un appel à l'autre) et Melbet ne fournit aucune requête qui
 * marche pour obtenir les matchs d'un championnat précis. On garde donc les
 * matchs vus à chaque rafraîchissement : la liste se remplit au fil du temps.
 */

/** Un match oublié de Melbet est gardé jusqu'à cette durée après son début. */
export const KEEP_AFTER_START_MS = 15 * 60 * 1000;
/** Durée estimée d'un match virtuel : au-delà, un match mémorisé est considéré terminé. */
export const LIVE_WINDOW_MS = 10 * 60 * 1000;
/** Plafond par championnat (les plus proches sont gardés). */
export const MAX_PER_LEAGUE = 30;

export type MatchMemory = Map<number, Map<string, Match>>;

/** Statut d'un match mémorisé, recalculé à partir de l'heure (Melbet ne l'a pas mis à jour). */
export function staleStatus(m: Match, now: number): MatchStatus {
  if (m.status === 'finished') return 'finished';
  if (m.startsAt > now) return 'upcoming';
  return now - m.startsAt < LIVE_WINDOW_MS ? 'live' : 'finished';
}

/**
 * Ajoute les matchs frais (ceux renvoyés par Melbet à cet appel) à la mémoire,
 * retire les matchs trop anciens et renvoie, par championnat, les matchs
 * frais + les matchs mémorisés (statut recalculé, marqués `remembered`).
 */
export function rememberMatches(memory: MatchMemory, fresh: Match[], now: number): Map<number, Match[]> {
  const freshIds = new Set<string>();
  for (const m of fresh) {
    if (m.leagueId === undefined) continue;
    freshIds.add(m.id);
    let league = memory.get(m.leagueId);
    if (!league) memory.set(m.leagueId, (league = new Map()));
    const previous = league.get(m.id);
    // Garde des cotes déjà connues si la nouvelle réponse n'en a pas.
    league.set(m.id, { ...m, odds: m.odds ?? previous?.odds, remembered: false });
  }

  const out = new Map<number, Match[]>();
  for (const [leagueId, league] of memory) {
    for (const [id, m] of league) {
      if (!freshIds.has(id) && now - m.startsAt > KEEP_AFTER_START_MS) league.delete(id);
    }
    const kept = [...league.values()]
      .map((m) => (freshIds.has(m.id) ? m : { ...m, status: staleStatus(m, now), liveScore: undefined, remembered: true }))
      .sort((a, b) => a.startsAt - b.startsAt);
    // Plafond : on retire d'abord les matchs terminés les plus anciens.
    while (kept.length > MAX_PER_LEAGUE) {
      const victim = kept.find((m) => m.status === 'finished') ?? kept[kept.length - 1];
      kept.splice(kept.indexOf(victim), 1);
      league.delete(victim.id);
    }
    if (kept.length) out.set(leagueId, kept);
    else memory.delete(leagueId);
  }
  return out;
}
