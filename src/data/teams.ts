import type { Team } from '../lib/types';
import { hashString } from '../lib/rng';

interface TeamProfile extends Team {
  aliases?: string[];
}

/** Clubs connus : couleurs de l'écusson et alias de noms. */
export const KNOWN_TEAMS: TeamProfile[] = [
  { name: 'Bayern Munich', short: 'FCB', colors: ['#dc052d', '#0066b2'], aliases: ['bayern', 'fc bayern'] },
  { name: 'Borussia Dortmund', short: 'BVB', colors: ['#fde100', '#1a1a1a'], aliases: ['dortmund'] },
  { name: 'Bayer Leverkusen', short: 'B04', colors: ['#e32221', '#1a1a1a'], aliases: ['leverkusen'] },
  { name: 'RB Leipzig', short: 'RBL', colors: ['#dd0741', '#ffffff'], aliases: ['leipzig'] },
  { name: 'VfB Stuttgart', short: 'VFB', colors: ['#e32219', '#ffffff'], aliases: ['stuttgart'] },
  { name: 'Eintracht Francfort', short: 'SGE', colors: ['#e1000f', '#1a1a1a'], aliases: ['francfort', 'frankfurt', 'eintracht'] },
  { name: 'SC Fribourg', short: 'SCF', colors: ['#e2001a', '#1a1a1a'], aliases: ['fribourg', 'freiburg'] },
  { name: 'VfL Wolfsburg', short: 'WOB', colors: ['#65b32e', '#ffffff'], aliases: ['wolfsburg'] },
  { name: 'Borussia Mönchengladbach', short: 'BMG', colors: ['#1a1a1a', '#00a650'], aliases: ['gladbach', 'monchengladbach', 'mönchengladbach'] },
  { name: 'Union Berlin', short: 'FCU', colors: ['#eb1923', '#fdd100'], aliases: ['union'] },
  { name: 'Werder Brême', short: 'SVW', colors: ['#1d9053', '#ffffff'], aliases: ['werder', 'breme', 'bremen'] },
  { name: 'TSG Hoffenheim', short: 'TSG', colors: ['#1c63b7', '#ffffff'], aliases: ['hoffenheim'] },
  { name: 'FC Augsbourg', short: 'FCA', colors: ['#ba3733', '#46714d'], aliases: ['augsbourg', 'augsburg'] },
  { name: 'Mayence 05', short: 'M05', colors: ['#c3141e', '#ffffff'], aliases: ['mayence', 'mainz'] },
  { name: 'FC Heidenheim', short: 'FCH', colors: ['#e2001a', '#003b79'], aliases: ['heidenheim'] },
  { name: 'FC St. Pauli', short: 'STP', colors: ['#6b4425', '#ffffff'], aliases: ['st pauli', 'st. pauli', 'pauli'] },
  { name: 'Hambourg SV', short: 'HSV', colors: ['#0a3f86', '#ffffff'], aliases: ['hambourg', 'hamburg', 'hsv'] },
  { name: 'FC Cologne', short: 'KOE', colors: ['#ed1c24', '#ffffff'], aliases: ['cologne', 'koln', 'köln'] },
];

const FALLBACK_COLORS: [string, string][] = [
  ['#39ff88', '#0a1124'], ['#f5c542', '#0a1124'], ['#4cc9f0', '#0a1124'],
  ['#ff4d6d', '#0a1124'], ['#b388ff', '#0a1124'], ['#ff9f1c', '#0a1124'],
];

export const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)/g, '').trim();

export function findProfile(name: string): TeamProfile | undefined {
  const n = norm(name);
  return KNOWN_TEAMS.find(
    (t) => norm(t.name) === n || t.aliases?.some((a) => n.includes(norm(a))),
  );
}

/**
 * Retrouve un club connu ou fabrique une identité visuelle stable à partir du nom.
 */
export function resolveTeam(name: string): Team {
  const p = findProfile(name);
  if (p) return { name: p.name, short: p.short, colors: p.colors };
  const clean = name.replace(/\(.*?\)/g, '').trim() || name;
  const initials = clean.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  return {
    name: clean,
    short: initials || '???',
    colors: FALLBACK_COLORS[hashString(clean) % FALLBACK_COLORS.length],
  };
}
