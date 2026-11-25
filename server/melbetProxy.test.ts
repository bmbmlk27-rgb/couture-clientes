import { describe, expect, it, vi } from 'vitest';
import { endpointFrom, handleMelbet, handleMelbetOddsRequest, handleMelbetRequest, MELBET_ORIGIN } from './melbetProxy';

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

describe('route /api/melbet-odds', () => {
  const getGame = { Value: { I: 555, GE: [
    { G: 2, E: [[{ T: 7, C: 1.9 }]] },
    { G: 1, E: [[{ T: 1, C: 1.72 }], [{ T: 2, C: 3.9 }], [{ T: 3, C: 4.6 }]] },
  ] } };

  it('appelle GetGame avec gameId et les paramètres fixes, renvoie { home, draw, away }', async () => {
    const f = ok(JSON.stringify(getGame));
    const res = await handleMelbet(new Request('https://x.app/api/melbet-odds?gameId=555'), f);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ home: 1.72, draw: 3.9, away: 4.6 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${MELBET_ORIGIN}/GetGame?gameId=555&cfView=3&fcountry=96&gr=2710&lng=fr_FR&ref=8&whence=22`);
    expect((init.headers as Record<string, string>).appguid).toBe('7c961562a8f43193_2');
  });

  it('accepte la réécriture Vercel ?route=odds', async () => {
    const res = await handleMelbet(new Request('https://x.app/api/melbet?route=odds&gameId=555'), ok(JSON.stringify(getGame)));
    expect(res.status).toBe(200);
  });

  it('valide gameId (pas d’injection dans l’URL Melbet)', async () => {
    const f = ok();
    for (const q of ['', '?gameId=', '?gameId=12&x', '?gameId=1%26gr%3D1', '?gameId=abc']) {
      const r = await handleMelbetOddsRequest(new Request(`https://x.app/api/melbet-odds${q}`), f);
      if (q === '?gameId=12&x') { expect(r.status).not.toBe(400); continue; }
      expect(r.status).toBe(400);
    }
  });

  it('marché à 2 issues (sans nul) : renvoie { home, away }', async () => {
    const twoWay = { Value: { GE: [{ G: 1, E: [[{ T: 1, C: 1.55 }], [{ T: 3, C: 2.4 }]] }] } };
    const res = await handleMelbetOddsRequest(new Request('https://x.app/api/melbet-odds?gameId=9'), ok(JSON.stringify(twoWay)));
    expect(await res.json()).toEqual({ home: 1.55, away: 2.4 });
  });

  it('debug=1 renvoie la réponse GetGame brute', async () => {
    const res = await handleMelbetOddsRequest(new Request('https://x.app/api/melbet-odds?gameId=9&debug=1'), ok('{"raw":true}'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"raw":true}');
  });

  it('404 si le marché 1X2 est absent, 502 si Melbet refuse ou renvoie du non-JSON', async () => {
    expect((await handleMelbetOddsRequest(new Request('https://x.app/api/melbet-odds?gameId=1'), ok('{"Value":{"E":[]}}'))).status).toBe(404);
    expect((await handleMelbetOddsRequest(new Request('https://x.app/api/melbet-odds?gameId=1'), ok('nope', 400))).status).toBe(502);
    expect((await handleMelbetOddsRequest(new Request('https://x.app/api/melbet-odds?gameId=1'), ok('<html>'))).status).toBe(502);
  });
});

describe('diagnostic /api/melbet-odds?probe=1', () => {
  it('prend le prochain match Penalty et essaie plusieurs variantes de GetGame', async () => {
    const champs = { data: [{ mainLigas: [
      { name: 'FC 26. Championnat d\'Allemagne', gamesCount: 4 },
      { name: 'FC25. Penalty', games: [{ id: 774050947, nonStarted: true, opponent1: { fullName: 'PSG' }, opponent2: { fullName: 'Al Nassr' } }] },
    ] }] };
    const f = vi.fn(async (url: string) =>
      new Response(url.includes('ChampsBySport') ? JSON.stringify(champs) : '{"Value":{}}', { status: url.includes('LineFeed') ? 200 : 404 }));
    const res = await handleMelbet(new Request('https://x.app/api/melbet-odds?probe=1'), f as unknown as typeof fetch);
    const body = await res.json();
    expect(body.game).toMatchObject({ id: 774050947, label: 'PSG - Al Nassr' });
    expect(body.attempts).toHaveLength(5);
    expect(body.attempts.every((a: { url: string }) => a.url.includes('774050947'))).toBe(true);
    expect(body.attempts.find((a: { url: string }) => a.url.includes('/LineFeed/mobile/v3/GetGame')).status).toBe(200);
  });
});
