'use client';

/**
 * PB-15 — klocki nowego wyglądu panelu (wzorzec: docs/design/wzorzec-panelu.html).
 * Zasady: liczby jako bohater, dymek po najechaniu na każdą liczbę i słupek
 * (także z klawiatury), status = kropka + słowo, mało kart, dużo struktury.
 * Dymek: atrybut `data-tip="tytuł\nszczegół"` + jeden <TipLayer/> w layoucie.
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { toast } from 'sonner';
import { cx } from './cx';

export type Tone = 'data' | 'warn' | 'muted';

/** Wysokości słupków w % (min. 8%, żeby zero było widać jako kreskę). Czysta funkcja — testowana. */
export function barHeights(values: number[], minPct = 8): number[] {
  const max = Math.max(0, ...values);
  if (max <= 0) return values.map(() => minPct);
  return values.map((v) => Math.max(minPct, Math.round((Math.max(0, v) / max) * 100)));
}

/** Tekst dymka: tytuł i szczegół w dwóch liniach. */
export function tip(title: string, detail?: string): string {
  return detail ? `${title}\n${detail}` : title;
}

/** Jeden dymek na całą aplikację — nasłuchuje `[data-tip]` (mysz i fokus). */
export function TipLayer() {
  const [state, setState] = useState<TipState | null>(null);
  useEffect(() => {
    const show = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]');
      if (!el) return setState(null);
      const r = el.getBoundingClientRect();
      setState({ x: r.left + r.width / 2, y: r.top, bottom: r.bottom, lines: (el.getAttribute('data-tip') ?? '').split('\n') });
    };
    const hide = () => setState(null);
    document.addEventListener('mouseover', show);
    document.addEventListener('focusin', show);
    document.addEventListener('scroll', hide, true);
    // Po kliknięciu treść dymka bywa już nieaktualna (np. przełącznik motywu).
    document.addEventListener('mousedown', hide);
    return () => {
      document.removeEventListener('mousedown', hide);
      document.removeEventListener('mouseover', show);
      document.removeEventListener('focusin', show);
      document.removeEventListener('scroll', hide, true);
    };
  }, []);
  return (
    <>
      {/* Gradient „fali w górę" dla słupków wykresów SVG (.v2-chart rect:hover). */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id="v2-wave" x1="0" y1="1" x2="0" y2="0" spreadMethod="repeat">
            <stop offset="0" style={{ stopColor: 'var(--data)' }} />
            <stop offset="0.5" style={{ stopColor: 'var(--data)' }} />
            <stop offset="0.66" style={{ stopColor: 'var(--data)' }} />
            <stop offset="0.78" style={{ stopColor: 'var(--data-hi)' }} />
            <stop offset="0.9" style={{ stopColor: 'var(--data)' }} />
            <stop offset="1" style={{ stopColor: 'var(--data)' }} />
            <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="0 -1" dur="2.2s" repeatCount="indefinite" />
          </linearGradient>
        </defs>
      </svg>
      {state && state.lines[0] ? <TipBubble state={state} /> : null}
    </>
  );
}

type TipState = { x: number; y: number; bottom: number; lines: string[] };

/** Pozycja dymka w granicach ekranu: nad elementem, a gdy brak miejsca — pod nim. Czysta funkcja — testowana. */
export function placeTip(
  anchor: { x: number; y: number; bottom: number },
  size: { w: number; h: number },
  view: { w: number; h: number },
  gap = 8,
  margin = 8,
): { left: number; top: number } {
  const left = Math.min(Math.max(anchor.x - size.w / 2, margin), Math.max(margin, view.w - size.w - margin));
  const above = anchor.y - gap - size.h;
  const top = above >= margin ? above : Math.min(anchor.bottom + gap, view.h - size.h - margin);
  return { left, top };
}

function TipBubble({ state }: { state: TipState }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos(placeTip(state, { w: el.offsetWidth, h: el.offsetHeight }, { w: window.innerWidth, h: window.innerHeight }));
  }, [state]);
  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none fixed z-[80] w-max max-w-[min(320px,calc(100vw-16px))] rounded-[5px] bg-foreground px-2.5 py-1.5 font-mono text-xs leading-snug text-background"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
    >
      <span className="block font-sans text-[12.5px] font-normal">{state.lines[0]}</span>
      {state.lines.slice(1).join(' · ')}
    </div>
  );
}

/** Styl komety na krawędzi (klasa `v2-comet`): wariant, czas, przesunięcie fazy, krycie. */
export function comet(k: 'a' | 'b' | 'c', d: number, dl: number, o = 0.6): CSSProperties {
  return { ['--v2-k' as string]: `v2-comet-${k}`, ['--v2-d' as string]: `${d}s`, ['--v2-dl' as string]: `${dl}s`, ['--v2-o' as string]: o };
}

/** Rząd kratek (np. domeny, kopie z 14 dni) — każda z dymkiem, poblask od boku. */
export function Squares({ items }: { items: { tone: Tone; tip: string }[] }) {
  return (
    <div className="v2-sweep -mx-0.5 flex gap-1 px-0.5 py-[3px]">
      {items.map((it, i) => (
        <i
          key={i}
          tabIndex={0}
          data-tip={it.tip}
          className={cx(
            'h-3.5 flex-1 cursor-default rounded-[2px] opacity-85 outline-none hover:opacity-100 hover:brightness-110 focus:opacity-100',
            it.tone === 'data' && 'bg-data',
            it.tone === 'warn' && 'bg-warn',
            it.tone === 'muted' && 'bg-raised',
          )}
        />
      ))}
    </div>
  );
}

/** Wykres dwóch serii obok siebie (np. doładowania / wydatki), skala od zera, dymki, fala na hover. */
export function DualBars({
  labels,
  a,
  b,
  aLabel,
  bLabel,
  format = (v: number) => v.toLocaleString('pl-PL'),
}: {
  labels: string[];
  a: number[];
  b: number[];
  aLabel: string;
  bLabel: string;
  format?: (v: number) => string;
}) {
  // Rysujemy w pikselach kontenera (nie skalujemy viewBoxa), żeby tekst osi miał stałe 11 px.
  const box = useRef<HTMLDivElement | null>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 200, L = 40, R = 4, T = 10, B = 24;
  const max = Math.max(1, ...a, ...b);
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const bw = (W - L - R) / Math.max(1, labels.length);
  const every = bw < 30 ? 3 : bw < 46 ? 2 : 1; // co który podpis miesiąca, żeby się nie nakładały
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const ticks: number[] = [];
  for (let t = 0; t <= top + 1e-9; t += step) ticks.push(t);
  return (
    <div ref={box} className="w-full">
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="v2-chart block" role="img" aria-label={`${aLabel} i ${bLabel}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted-foreground)" className="font-mono">
            {format(t)}
          </text>
        </g>
      ))}
      {labels.map((m, i) => {
        const x = L + i * bw;
        const w = Math.max(1, (bw - 8) / 2);
        const ha = (H - T - B) * (a[i]! / top);
        const hb = (H - T - B) * (b[i]! / top);
        return (
          <g key={m + i}>
            <rect tabIndex={0} x={x + 3} y={H - B - ha} width={w} height={ha} rx={1.5} fill="var(--data-soft)" data-tip={tip(format(a[i]!), `${aLabel} · ${m}`)} style={{ ['--v2-i' as string]: i * 2 }} />
            <rect tabIndex={0} x={x + 4 + w} y={H - B - hb} width={w} height={hb} rx={1.5} fill="var(--data)" data-tip={tip(format(b[i]!), `${bLabel} · ${m}`)} style={{ ['--v2-i' as string]: i * 2 + 1 }} />
            {i % every === (labels.length - 1) % every ? (
              <text x={x + bw / 2} y={H - 7} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)" className="font-mono">
                {m}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
    </div>
  );
}

/** „Ładny" krok osi: 1, 2, 5 × 10^n. Czysta funkcja — testowana. */
export function niceStep(max: number, ticks = 4): number {
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('font-mono text-[11px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground', className)}>
      {children}
    </div>
  );
}

/** Pasek liczb: jeden obramowany pas z podziałkami zamiast 4 osobnych kart. */
export function KpiStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 rounded-[10px] border border-line bg-card sm:grid-cols-2 xl:grid-cols-4 [&>*]:border-line max-sm:[&>*+*]:border-t sm:max-xl:[&>*:nth-child(even)]:border-l sm:max-xl:[&>*:nth-child(n+3)]:border-t xl:[&>*+*]:border-l">
      {children}
    </div>
  );
}

export function Kpi({
  label,
  value,
  unit,
  children,
  foot,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  children?: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 px-[18px] pb-3.5 pt-4">
      <Label>{label}</Label>
      <div className="font-display text-[30px] font-extrabold leading-none tracking-[-0.03em] text-foreground tabular-nums">
        {value}
        {unit ? <small className="ml-1 font-mono text-[13px] font-medium tracking-normal text-muted-foreground">{unit}</small> : null}
      </div>
      {children}
      {foot ? <div className="flex min-h-[19px] justify-between gap-2 text-[12.5px] text-muted-foreground">{foot}</div> : null}
    </div>
  );
}

/** Mikro-słupki (np. 7 dni). Ostatni słupek wyróżniony; każdy z dymkiem. */
export function MiniBars({
  values,
  labels,
  unit,
  lastTone = 'data',
  format = (v: number) => v.toLocaleString('pl-PL'),
}: {
  values: number[];
  labels: string[];
  unit: string;
  lastTone?: Tone;
  format?: (v: number) => string;
}) {
  const h = barHeights(values);
  return (
    <div className="v2-bars flex h-[30px] items-end gap-[3px]">
      {values.map((v, i) => {
        const last = i === values.length - 1;
        return (
          <i
            key={i}
            tabIndex={0}
            data-tip={tip(`${format(v)} ${unit}`, labels[i])}
            style={{ height: `${h[i]}%`, ['--v2-i' as string]: i }}
            className={cx(
              'min-h-[2px] flex-1 cursor-default rounded-[1px] outline-none transition-colors hover:bg-data-hi focus:bg-data-hi',
              last ? (lastTone === 'warn' ? 'bg-warn' : 'bg-data') : 'bg-data-soft',
            )}
          />
        );
      })}
    </div>
  );
}

/** Pasek segmentowy (np. podział dysku). `total` = pełna szerokość (limit). */
export function StackBar({
  parts,
  total,
  height = 10,
}: {
  parts: { label: string; value: number; color: string; detail?: string }[];
  total: number;
  height?: number;
}) {
  const safeTotal = total > 0 ? total : 1;
  return (
    <div className="v2-sweep flex gap-[2px] rounded-[2px] bg-raised" style={{ height }}>
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <i
            key={p.label}
            tabIndex={0}
            data-tip={tip(p.label, p.detail)}
            style={{ width: `${Math.min(100, (p.value / safeTotal) * 100)}%`, background: p.color }}
            className="block h-full cursor-default outline-none transition-[filter] first:rounded-l-[2px] hover:brightness-125 focus:brightness-125"
          />
        ))}
    </div>
  );
}

export function Meter({ pct, tone = 'data', tipText }: { pct: number; tone?: Tone; tipText?: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <span className="mt-1.5 block h-[5px] w-full overflow-hidden rounded-[3px] bg-raised" data-tip={tipText}>
      <i className={cx('block h-full', tone === 'warn' ? 'bg-warn' : 'bg-data')} style={{ width: `${w}%` }} />
    </span>
  );
}

export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-[7px] whitespace-nowrap rounded-full py-[3px] pl-2 pr-[9px] text-[12.5px] font-semibold leading-[1.4]',
        tone === 'data' && 'bg-data-soft text-data-hi',
        tone === 'warn' && 'bg-warn-soft text-warn',
        tone === 'muted' && 'bg-raised text-muted-foreground',
      )}
    >
      <span
        className={cx(
          'h-[7px] w-[7px] flex-none rounded-full bg-current',
          tone === 'data' && 'v2-breathe',
          tone === 'warn' && 'v2-breathe v2-breathe-warn',
        )}
      />
      {children}
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-6 w-[42px] flex-none rounded-full border p-0 transition-colors disabled:opacity-50',
        checked ? 'border-data bg-data-soft' : 'border-line-strong bg-raised',
      )}
    >
      <span
        className={cx(
          'absolute left-[2px] top-[2px] h-[18px] w-[18px] rounded-full transition-transform',
          checked ? 'translate-x-[18px] bg-data' : 'bg-muted-foreground',
        )}
      />
    </button>
  );
}

/** Box w prawej kolumnie: tytuł + akcja w nagłówku, treść, opcjonalna stopka. */
export function Box({
  title,
  action,
  children,
  footer,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('rounded-[10px] border border-line bg-card', className)}>
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <h3 className="m-0 font-display text-[15px] font-bold text-foreground">{title}</h3>
        {action}
      </div>
      {children}
      {footer ? <div className="flex flex-wrap gap-2 px-4 pb-3.5 pt-3">{footer}</div> : null}
    </section>
  );
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Skopiowano: ${text}`);
  } catch {
    toast.error('Nie udało się skopiować — zaznacz tekst ręcznie.');
  }
}

/** Kopiowalna wartość (adres, login). */
export function CopyValue({ value, className }: { value: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => copy(value)}
      data-tip="Kopiuj"
      className={cx(
        'break-all border-0 bg-transparent p-0 text-left font-mono text-[13.5px] font-medium leading-[1.45] tracking-[-0.01em] text-foreground hover:text-primary hover:underline hover:underline-offset-[3px]',
        className,
      )}
    >
      {value}
    </button>
  );
}

/** Dane dostępowe: adresy po lewej (jeden pod drugim), port po prawej. */
export function AccessList({ items }: { items: { label: string; values: string[]; port?: string | null }[] }) {
  return (
    <ul className="m-0 list-none px-4 py-0">
      {items
        .filter((it) => it.values.length > 0)
        .map((it) => (
          <li key={it.label} className="flex flex-col gap-[5px] border-t border-line py-[9px]">
            <Label>{it.label}</Label>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                {it.values.map((v) => (
                  <CopyValue key={v} value={v} />
                ))}
              </div>
              {it.port ? (
                <span className="flex-none whitespace-nowrap rounded bg-raised px-[7px] font-mono text-xs font-medium leading-[1.9] text-muted-foreground" data-tip="Port">
                  {it.port}
                </span>
              ) : null}
            </div>
          </li>
        ))}
    </ul>
  );
}

/** Nagłówek sekcji w dużej kolumnie. */
export function SectionHead({ title, desc, action }: { title: ReactNode; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="m-0 font-display text-[17px] font-bold leading-tight tracking-[-0.01em] text-foreground">{title}</h2>
        {desc ? <p className="mt-1 max-w-[60ch] text-[13.5px] text-muted-foreground">{desc}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Etykiety 7 ostatnich dni (od najstarszego), np. „pon., 15 wrz”. */
export function lastDaysLabels(n: number, today = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (n - 1 - i));
    return d.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' });
  });
}

/** MB → „512 MB" / „12,4 GB". */
export function fmtMb(mb: number | null | undefined): string {
  if (mb == null || !Number.isFinite(mb)) return '—';
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} GB`;
}

/** Szereg 24 h → `n` kubełków (maksimum w kubełku) + etykiety godzin. Czysta funkcja — testowana. */
export function bucketize(
  rows: { bucketStart: string; value: number }[],
  n: number,
): { values: number[]; labels: string[] } {
  if (rows.length === 0) return { values: [], labels: [] };
  const size = Math.ceil(rows.length / n);
  const values: number[] = [];
  const labels: string[] = [];
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    values.push(Math.max(...chunk.map((r) => r.value)));
    labels.push(new Date(chunk[0]!.bucketStart).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }));
  }
  return { values, labels };
}

