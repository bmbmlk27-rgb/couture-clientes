import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

export interface TabDef<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
  count?: number;
}

/** Onglets avec indicateur glissant partagé (layoutId). */
export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: TabDef<T>[]; active: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-1 rounded-2xl border border-white/[.06] bg-night-800/50 p-1 backdrop-blur-xl">
        {tabs.map((t) => {
          const selected = t.id === active;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(t.id)}
              className={`relative flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-neon/60 ${
                selected ? 'text-abyss' : 'text-slate-400 hover:text-white'
              }`}
            >
              {selected && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-neon to-neon-soft shadow-neon"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <Icon className="relative h-4 w-4" />
              <span className="relative">{t.label}</span>
              {t.count !== undefined && (
                <span className={`relative rounded-md px-1.5 font-mono text-[11px] ${selected ? 'bg-abyss/15' : 'bg-white/5'}`}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
