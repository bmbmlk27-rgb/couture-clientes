/** Décor de stade : grille de terrain, halos de projecteurs et ligne de balayage. */
export function Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-abyss">
      <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-neon/10 blur-[120px]" />
      <div className="absolute -right-32 top-1/3 h-[480px] w-[480px] rounded-full bg-gold/[.07] blur-[120px]" />
      <div className="absolute bottom-[-200px] left-1/3 h-[420px] w-[620px] rounded-full bg-blue-600/10 blur-[140px]" />
      <div
        className="absolute inset-0 opacity-[.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse at 50% 0%, #000 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 0%, #000 30%, transparent 75%)',
        }}
      />
      {/* Cercle central du terrain */}
      <div className="absolute left-1/2 top-[38%] h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[.04]" />
      <div className="absolute left-0 right-0 top-0 h-32 animate-scan bg-gradient-to-b from-transparent via-neon/[.04] to-transparent motion-reduce:hidden" />
    </div>
  );
}
