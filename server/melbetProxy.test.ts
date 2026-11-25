import { describe, expect, it, vi } from 'vitest';
import { endpointFrom, handleMelbetRequest, MELBET_ORIGIN } from './melbetProxy';

const ok = (body = '{"data":[]}', status = 200) =>
  vi.fn(async () => new Response(body, { status, headers: { 'content-type': 'application/json' } }));

describe('endpointFrom', () => {
  it('lit ?path= (Vercel) et le chemin (Netlify)', () => {
    expect(endpointFrom(new URL('https://x.app/api/melbet?path=ChampsBySport&a=1'))).toBe('ChampsBySport');
    expect(endpointFrom(new URL('https://x.app/api/melbet/ChampsBySport?a=1'))).toBe('ChampsBySport');
  });
});

describe('handleMelbetRequest', () => {
  it('relaie la requête avec les en-têtes Melbet et sans le paramètre path', async () => {
    const f = ok();
    const res = await handleMelbetRequest(new Request('https://x.app/api/melbet?path=ChampsBySport&sportIds=85&gr=2710'), f);
    expect(res.status).toBe(200);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${MELBET_ORIGIN}/ChampsBySport?sportIds=85&gr=2710`);
    expect((init.headers as Record<string, string>)['x-bundleid']).toBe('org.melbet.vac');
    expect(res.headers.get('cache-control')).toContain('s-maxage');
  });

  it('transmet un 400 Melbet sans le mettre en cache', async () => {
    const res = await handleMelbetRequest(new Request('https://x.app/api/melbet/ChampsBySport'), ok('bad', 400));
    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('refuse les endpoints non autorisés et les méthodes autres que GET', async () => {
    const f = ok();
    expect((await handleMelbetRequest(new Request('https://x.app/api/melbet/Evil'), f)).status).toBe(404);
    expect((await handleMelbetRequest(new Request('https://x.app/api/melbet/ChampsBySport', { method: 'POST' }), f)).status).toBe(405);
    expect(f).not.toHaveBeenCalled();
  });

  it('renvoie 502 si Melbet est injoignable', async () => {
    const f = vi.fn(async () => { throw new TypeError('fetch failed'); });
    expect((await handleMelbetRequest(new Request('https://x.app/api/melbet/ChampsBySport'), f)).status).toBe(502);
  });
});
