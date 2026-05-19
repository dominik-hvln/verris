'use client';

type Props = {
  points: number;
  pointsPerTree: number;
};

export function EcoTreeProgress({ points, pointsPerTree }: Props) {
  const safeTarget = Math.max(1, pointsPerTree);
  const progressInTree = points % safeTarget;
  const pct = Math.min(100, Math.round((progressInTree / safeTarget) * 100));
  const treesEarned = Math.floor(points / safeTarget);
  const remaining = safeTarget - progressInTree;

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <section className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.08] to-black/40 p-6 md:p-8">
      <div className="flex flex-col md:flex-row gap-8 items-center">
        <div className="relative shrink-0">
          <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="10"
            />
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke="#10b981"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-[stroke-dashoffset] duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span className="text-2xl font-bold text-white tabular-nums">{pct}%</span>
            <span className="text-[10px] uppercase tracking-widest text-emerald-300/80">do drzewa</span>
          </div>
        </div>

        <div className="flex-1 space-y-3 text-center md:text-left">
          <h2 className="text-xl font-bold text-white flex items-center justify-center md:justify-start gap-2">
            <span aria-hidden>🌱</span> Twój las Verris
          </h2>
          <p className="text-sm text-neutral-300 leading-relaxed">
            Zbierasz punkty EKO za ekologiczne działania na hostingu. Co{' '}
            <strong className="text-emerald-300">{safeTarget.toLocaleString('pl-PL')} pkt</strong> — pomagamy
            posadzić kolejne drzewo.
          </p>
          <div className="flex flex-wrap gap-3 justify-center md:justify-start text-sm">
            <Stat label="Punkty" value={points.toLocaleString('pl-PL')} />
            <Stat label="Drzewa (łącznie)" value={String(treesEarned)} />
            <Stat label="Do kolejnego" value={`${remaining.toLocaleString('pl-PL')} pkt`} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 min-w-[7rem]">
      <p className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</p>
      <p className="text-lg font-semibold text-white tabular-nums">{value}</p>
    </div>
  );
}
