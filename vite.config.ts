/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * L'API Melbet/Xenvelop n'envoie pas d'en-têtes CORS et le navigateur interdit
 * de forcer `user-agent`. En dev (et en `vite preview`), on passe donc par un
 * proxy local `/api/melbet` qui injecte les en-têtes côté serveur.
 */
const MELBET_TARGET = 'https://n4vkteatv6x0.com';
const MELBET_HEADERS: Record<string, string> = {
  accept: 'application/vnd.xenvelop+json',
  'x-language': 'fr_FR',
  'x-bundleid': 'org.melbet.vac',
  appguid: '7c961562a8f43193_2',
  'x-fcountry': '96',
  'user-agent': 'org.melbet.vac-user-agent/melbet-v258.0.5',
  version: 'melbet-v258.0.5',
};

const proxy = {
  '/api/melbet': {
    target: MELBET_TARGET,
    changeOrigin: true,
    secure: true,
    rewrite: (p: string) => p.replace(/^\/api\/melbet/, '/MainFeedLive/mobile/v3'),
    headers: MELBET_HEADERS,
  },
};

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
  test: { environment: 'node' },
});
