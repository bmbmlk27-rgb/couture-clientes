import { describe, expect, it } from 'vitest';
import { jwtRole, resolveSupabaseEnv } from './supabaseEnv';

const jwt = (role: string) =>
  `xx.${Buffer.from(JSON.stringify({ iss: 'supabase', role })).toString('base64url')}.sig`;

describe('resolveSupabaseEnv', () => {
  it('lit les noms VITE_ standard', () => {
    const r = resolveSupabaseEnv({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: jwt('anon') });
    expect(r.missing).toEqual([]);
    expect(r.url).toBe('https://abc.supabase.co');
    expect(r.keyFrom).toBe('VITE_SUPABASE_ANON_KEY');
  });

  it('accepte les noms créés par l’intégration Supabase de Vercel', () => {
    const r = resolveSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon') });
    expect(r.missing).toEqual([]);
    expect(r.urlFrom).toBe('NEXT_PUBLIC_SUPABASE_URL');
    const s = resolveSupabaseEnv({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_123' });
    expect(s.missing).toEqual([]);
  });

  it('nettoie les erreurs de copier-coller (espaces, guillemets, slash, /rest/v1, https manquant)', () => {
    expect(resolveSupabaseEnv({ VITE_SUPABASE_URL: '  "https://abc.supabase.co/rest/v1/" ', VITE_SUPABASE_ANON_KEY: 'k' }).url).toBe('https://abc.supabase.co');
    expect(resolveSupabaseEnv({ VITE_SUPABASE_URL: 'abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' }).url).toBe('https://abc.supabase.co');
  });

  it('liste les variables manquantes (→ mode démo)', () => {
    expect(resolveSupabaseEnv({}).missing).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']);
    expect(resolveSupabaseEnv({ VITE_SUPABASE_URL: 'https://a.supabase.co', VITE_SUPABASE_ANON_KEY: '   ' }).missing).toEqual(['VITE_SUPABASE_ANON_KEY']);
  });

  it('refuse une clé secrète (service_role ou sb_secret_)', () => {
    expect(() => resolveSupabaseEnv({ VITE_SUPABASE_URL: 'https://a.supabase.co', VITE_SUPABASE_ANON_KEY: jwt('service_role') })).toThrow(/SECRÈTE/);
    expect(() => resolveSupabaseEnv({ SUPABASE_ANON_KEY: 'sb_secret_abc' })).toThrow(/SECRÈTE/);
    expect(jwtRole(jwt('anon'))).toBe('anon');
  });
});
