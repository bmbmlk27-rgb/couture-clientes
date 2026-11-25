import type { MatchStatus } from '../lib/types';
import type { Odds } from '../lib/odds';

/** Statuts proposés dans le formulaire (« En direct » reste possible en base). */
export type FormStatus = Extract<MatchStatus, 'finished' | 'upcoming'>;

export interface OddsInput {
  home: string;
  draw: string;
  away: string;
}

export interface MatchInput {
  home: number | '';
  away: number | '';
  status: FormStatus;
  /** AAAA-MM-JJ (input type="date") */
  date: string;
  /** HH:MM (input type="time") */
  time: string;
  ft: [number, number];
  ht: [number, number];
  odds: OddsInput;
}

/** Tolérance pour un match « À venir » saisi juste après le coup d'envoi. */
export const UPCOMING_PAST_TOLERANCE_MS = 15 * 60 * 1000;

/** Date locale saisie → objet Date (null si invalide). */
export function toDate(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}`); // interprété dans le fuseau du navigateur
  return Number.isNaN(d.getTime()) ? null : d;
}

const parseOdd = (s: string) => Number(s.trim().replace(',', '.'));

/**
 * Cotes saisies → { odds } (null = aucune cote) ou { error }.
 * Les trois ou aucune, chacune > 1 (règle identique à la contrainte SQL).
 */
export function parseOddsInput(o: OddsInput): { odds: Odds | null } | { error: string } {
  const raw = [o.home, o.draw, o.away].map((s) => s.trim());
  const filled = raw.filter(Boolean).length;
  if (filled === 0) return { odds: null };
  if (filled < 3) return { error: 'Saisissez les trois cotes (1, X, 2) ou aucune.' };
  const [home, draw, away] = raw.map(parseOdd);
  if (![home, draw, away].every((v) => Number.isFinite(v) && v > 1 && v < 1000)) {
    return { error: 'Cote invalide : nombre décimal supérieur à 1 attendu (ex. 1.85 ou 1,85).' };
  }
  return { odds: { home, draw, away } };
}

/** Mêmes règles que les contraintes SQL de `matches` (message clair avant l'envoi). */
export function validateMatchInput(v: MatchInput, now: number = Date.now()): string | null {
  if (!v.home || !v.away) return 'Choisissez les deux équipes.';
  if (v.home === v.away) return 'Une équipe ne peut pas jouer contre elle-même.';
  const when = toDate(v.date, v.time);
  if (!when) return 'Renseignez la date et l’heure du match.';

  if (v.status === 'finished') {
    if ([...v.ft, ...v.ht].some((n) => !Number.isInteger(n) || n < 0)) return 'Les scores doivent être des entiers positifs.';
    if (v.ht[0] > v.ft[0] || v.ht[1] > v.ft[1]) return 'Le score à la mi-temps ne peut pas dépasser le score final.';
  } else {
    if (when.getTime() < now - UPCOMING_PAST_TOLERANCE_MS) {
      return 'Un match « À venir » ne peut pas être dans le passé : vérifiez la date et l’heure, ou choisissez « Terminé ».';
    }
  }

  const odds = parseOddsInput(v.odds);
  if ('error' in odds) return odds.error;
  return null;
}

/** URL de logo acceptée : http(s) uniquement (même règle qu'en SQL). */
export function validateLogoUrl(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  if (!/^https?:\/\/\S+$/i.test(u)) return 'L’URL du logo doit commencer par https:// (ou http://).';
  return null;
}
