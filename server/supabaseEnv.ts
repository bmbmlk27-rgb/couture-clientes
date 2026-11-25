/**
 * Lecture des identifiants Supabase AU MOMENT DU BUILD (vite.config.ts).
 *
 * Vite n'expose au navigateur que les variables préfixées VITE_. Or
 * l'intégration Supabase de Vercel crée des variables NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_URL, SUPABASE_ANON_KEY… qui seraient ignorées et feraient sortir le
 * site en mode démo. On accepte donc ces noms comme alternatives.
 *
 * Sécurité : une clé secrète (service_role ou sb_secret_…) ferait partie du
 * JavaScript public. Le build est alors arrêté avec un message explicite.
 */

export const URL_NAMES = ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'] as const;
export const KEY_NAMES = [
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
] as const;

export interface SupabaseEnv {
  url: string;
  key: string;
  /** Nom de la variable effectivement utilisée (pour les logs de build). */
  urlFrom?: string;
  keyFrom?: string;
  /** Variables attendues absentes : vide = Supabase configuré. */
  missing: string[];
}

/** Valeur nettoyée : espaces, guillemets copiés par erreur. */
const clean = (v: string | undefined) => (v ?? '').trim().replace(/^["']|["']$/g, '').trim();

function pick(env: Record<string, string | undefined>, names: readonly string[]) {
  for (const name of names) {
    const value = clean(env[name]);
    if (value) return { value, name };
  }
  return { value: '', name: undefined };
}

/** Rôle contenu dans une clé JWT Supabase (legacy anon / service_role), sinon undefined. */
export function jwtRole(key: string): string | undefined {
  const parts = key.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const role = JSON.parse(json).role;
    return typeof role === 'string' ? role : undefined;
  } catch {
    return undefined;
  }
}

export function resolveSupabaseEnv(env: Record<string, string | undefined>): SupabaseEnv {
  const u = pick(env, URL_NAMES);
  const k = pick(env, KEY_NAMES);

  if (k.value && (k.value.startsWith('sb_secret_') || jwtRole(k.value) === 'service_role')) {
    throw new Error(
      `[MLK] ${k.name} contient une clé SECRÈTE Supabase (service_role / sb_secret_). ` +
        'Elle serait publiée dans le JavaScript du site : build arrêté. ' +
        'Utilisez la clé « anon public » ou « publishable » (Supabase → Project Settings → API Keys).',
    );
  }

  let url = u.value.replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '');
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;

  const missing: string[] = [];
  if (!url) missing.push('VITE_SUPABASE_URL');
  if (!k.value) missing.push('VITE_SUPABASE_ANON_KEY');
  return { url, key: k.value, urlFrom: u.name, keyFrom: k.name, missing };
}
