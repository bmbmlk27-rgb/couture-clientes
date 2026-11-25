import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * ============================================================================
 *  IDENTIFIANTS SUPABASE — à renseigner par l'administrateur
 * ============================================================================
 *  NE PAS écrire les clés dans ce fichier. Elles sont lues depuis :
 *   • en local       : le fichier `.env.local` à la racine (copier `.env.example`)
 *   • en production  : les variables d'environnement Vercel / Netlify
 *
 *    VITE_SUPABASE_URL       = https://<votre-projet>.supabase.co
 *    VITE_SUPABASE_ANON_KEY  = clé « anon public » (Dashboard → Project Settings → API)
 *
 *  ⚠ N'utilisez JAMAIS la clé `service_role` ici : tout ce qui commence par
 *  VITE_ est intégré au JavaScript envoyé aux visiteurs. La clé anon est
 *  publique par conception ; la sécurité repose sur les règles RLS de
 *  `supabase/schema.sql` (lecture publique, écriture réservée aux admins).
 * ============================================================================
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** `null` quand les variables ne sont pas définies : l'app passe alors en mode démo. */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase non configuré : définissez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
}
