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

  const radius = 72;
  const size = 180;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-[#0a120f] to-black p-8 md:p-10 lg:p-12">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-emerald-400/5 blur-3xl" />

      <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-10 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
        <div className="relative shrink-0">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-90 drop-shadow-[0_0_24px_rgba(16,185,129,0.25)]"
          >
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="12"
            />
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="#10b981"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-[stroke-dashoffset] duration-700 ease-out"
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-4xl font-bold text-white tabular-nums">{pct}%</span>
            <span className="mt-1 text-[11px] font-medium uppercase tracking-[0.2em] text-emerald-300/90">
              do kolejnego drzewa
            </span>
          </div>
        </div>

        <div className="flex-1 space-y-6 text-center lg:max-w-md lg:text-left">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-400/80">Las Verris</p>
            <h2 className="mt-2 text-2xl font-bold text-white md:text-3xl">Twój postęp w programie EKO</h2>
            <p className="mt-3 text-sm leading-relaxed text-neutral-300 md:text-base">
              Zbierasz punkty za ekologiczne działania na hostingu. Co{' '}
              <strong className="text-emerald-300">{safeTarget.toLocaleString('pl-PL')} punktów</strong> — wspólnie
              sadzimy kolejne drzewo.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Twoje punkty" value={points.toLocaleString('pl-PL')} highlight />
            <Stat label="Drzewa łącznie" value={String(treesEarned)} />
            <Stat label="Do kolejnego" value={`${remaining.toLocaleString('pl-PL')}`} sub="pkt" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-4 text-center lg:text-left ${
        highlight ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-white/10 bg-black/30'
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white tabular-nums">
        {value}
        {sub ? <span className="ml-1 text-sm font-medium text-neutral-400">{sub}</span> : null}
      </p>
    </div>
  );
}
