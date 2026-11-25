import { motion, useScroll, useTransform } from 'framer-motion';
import { RefreshCw, Gamepad2 } from 'lucide-react';
import type { DataSource } from '../lib/types';

interface Props {
  source: DataSource;
  error?: string;
  latency?: number;
  loading: boolean;
  updatedAt: number;
  onRefresh: () => void;
}

export function Header({ source, error, latency, loading, updatedAt, onRefresh }: Props) {
  const { scrollY } = useScroll();
  // Ombre et opacité dynamiques selon le défilement
  const shadow = useTransform(scrollY, [0, 120], ['0 0 0 rgba(0,0,0,0)', '0 18px 40px -12px rgba(0,0,0,.85)']);
  const bg = useTransform(scrollY, [0, 120], ['rgba(6,10,24,.35)', 'rgba(6,10,24,.78)']);
  const border = useTransform(scrollY, [0, 120], ['rgba(255,255,255,.04)', 'rgba(57,255,136,.18)']);
  const connected = source === 'api';

  return (
    <motion.header
      style={{ boxShadow: shadow, backgroundColor: bg, borderColor: border }}
      className="sticky top-0 z-40 border-b backdrop-blur-2xl backdrop-saturate-150"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3.5 sm:px-6">
        <motion.div
          initial={{ rotate: -90, scale: 0 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 14 }}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-neon to-gold text-abyss shadow-neon"
        >
          <Gamepad2 className="h-5 w-5" />
        </motion.div>
        <div className="min-w-0">
          <h1 className="animate-gradient-x truncate bg-gradient-to-r from-neon via-gold to-neon bg-[length:200%_auto] bg-clip-text font-display text-xl font-bold uppercase tracking-wide text-transparent sm:text-2xl">
            MLK FIFA Virtuel
          </h1>
          <p className="hidden text-[11px] uppercase tracking-[.22em] text-slate-500 sm:block">Prédictions · Double Poisson</p>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
              connected ? 'border-neon/30 bg-neon/10 text-neon' : 'border-danger/30 bg-danger/10 text-danger'
            }`}
            title={connected ? `API connectée${latency ? ` (${latency} ms)` : ''}` : `API déconnectée : ${error ?? 'inconnue'} — données de test`}
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className={`absolute inline-flex h-full w-full animate-ping-slow rounded-full ${connected ? 'bg-neon' : 'bg-danger'}`} />
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${connected ? 'bg-neon' : 'bg-danger'}`} />
            </span>
            <span className="hidden sm:inline">{connected ? 'API connectée' : 'API déconnectée'}</span>
            <span className="sm:hidden">{connected ? 'Live' : 'Off'}</span>
          </div>
          <span className="hidden font-mono text-[11px] text-slate-500 md:inline">
            {new Date(updatedAt).toLocaleTimeString('fr-FR')}
          </span>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onRefresh}
            disabled={loading}
            aria-label="Rafraîchir"
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:border-neon/40 hover:text-neon disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </motion.button>
        </div>
      </div>
    </motion.header>
  );
}
