import type { MatchStatus } from '../lib/types';

export interface MatchInput {
  home: number | '';
  away: number | '';
  status: MatchStatus;
  ft: [number, number];
  ht: [number, number];
}

/** Mêmes règles que les contraintes SQL de `matches` (message clair avant l'envoi). */
export function validateMatchInput(v: MatchInput): string | null {
  if (!v.home || !v.away) return 'Choisissez les deux équipes.';
  if (v.home === v.away) return 'Une équipe ne peut pas jouer contre elle-même.';
  if (v.status === 'finished') {
    if ([...v.ft, ...v.ht].some((n) => !Number.isInteger(n) || n < 0)) return 'Les scores doivent être des entiers positifs.';
    if (v.ht[0] > v.ft[0] || v.ht[1] > v.ft[1]) return 'Le score à la mi-temps ne peut pas dépasser le score final.';
  }
  return null;
}
