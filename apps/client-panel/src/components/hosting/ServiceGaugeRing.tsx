'use client';

import { useEffect, useState } from 'react';

const R = 36;
const CX = 50;
const CY = 48;
const ARC = Math.PI * R;

const COLORS = {
  cyan: '#22d3ee',
  violet: '#a78bfa',
  amber: '#fbbf24',
  emerald: '#34d399',
  rose: '#fb7185',
};

export function ServiceGaugeRing({
  label,
  value,
  max,
  unit = '%',
  color = COLORS.cyan,
  delayMs = 0,
}: {
  label: string;
  value: number;
  max: number;
  unit?: string;
  color?: string;
  delayMs?: number;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setAnimated(pct), 80 + delayMs);
    return () => window.clearTimeout(t);
  }, [pct, delayMs]);

  const offset = ARC - (animated / 100) * ARC;
  const display =
    unit === '%'
      ? `${Math.round(value)}%`
      : unit === ''
        ? `${Math.round(value)}`
        : `${Math.round(value)}${unit}`;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 58" className="w-[108px] h-[62px]" aria-hidden>
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${ARC}`}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
          style={{
            filter: `drop-shadow(0 0 6px ${color}55)`,
          }}
        />
        <text
          x={CX}
          y={CY - 4}
          textAnchor="middle"
          className="fill-white text-[13px] font-bold"
          style={{ fontSize: 13, fontWeight: 700, fill: '#fff' }}
        >
          {display}
        </text>
      </svg>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mt-1 text-center">
        {label}
      </p>
    </div>
  );
}

export { COLORS as gaugeColors };
