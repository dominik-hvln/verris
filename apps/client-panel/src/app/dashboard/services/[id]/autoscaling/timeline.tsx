import { ArrowDownToLine, ArrowUpFromLine, Coins, History } from 'lucide-react';
import { formatCredits } from '@/lib/credits';
import type { AutoscalingChargeDto, AutoscalingEventDto } from './data';

interface Props {
  events: AutoscalingEventDto[];
  charges: AutoscalingChargeDto[];
}

interface TimelineEntry {
  id: string;
  kind: 'event' | 'charge';
  createdAt: string;
  event?: AutoscalingEventDto;
  charge?: AutoscalingChargeDto;
}

export function AutoscalingTimeline({ events, charges }: Props) {
  const merged: TimelineEntry[] = [
    ...events.map((e) => ({
      id: `evt-${e.id}`,
      kind: 'event' as const,
      createdAt: e.createdAt,
      event: e,
    })),
    ...charges.map((c) => ({
      id: `chg-${c.id}`,
      kind: 'charge' as const,
      createdAt: c.createdAt,
      charge: c,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <section className="rounded-2xl border border-white/5 bg-[#0a0a0a] p-6">
      <div className="flex items-center gap-2 mb-5">
        <History className="h-5 w-5 text-emerald-400" />
        <h2 className="text-lg font-bold text-white">Historia kosztów i zdarzeń</h2>
        <span className="text-xs text-neutral-500 ml-2">
          (ostatnie 100 zdarzeń · 100 naliczeń)
        </span>
      </div>

      {merged.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-center text-sm text-neutral-400">
          Jeszcze żadnego zdarzenia ani naliczenia. Włącz autoskalowanie i odczekaj
          pierwszy skok ruchu.
        </div>
      ) : (
        <ul className="space-y-2">
          {merged.map((entry) =>
            entry.kind === 'event' ? (
              <EventRow key={entry.id} event={entry.event!} />
            ) : (
              <ChargeRow key={entry.id} charge={entry.charge!} />
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function EventRow({ event }: { event: AutoscalingEventDto }) {
  const isUp = event.type === 'SCALE_UP' || event.type === 'AUTOSCALING_ENABLED';
  const isDown = event.type === 'SCALE_DOWN' || event.type === 'AUTOSCALING_DISABLED';
  const Icon = isUp ? ArrowUpFromLine : isDown ? ArrowDownToLine : History;
  const tone = isUp
    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
    : isDown
      ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
      : 'border-white/10 bg-white/[0.02] text-neutral-200';

  return (
    <li
      className={`flex items-center justify-between gap-4 rounded-xl border ${tone} px-4 py-3`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Icon className="h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-semibold">{humaniseEventType(event.type)}</div>
          <div className="text-[11px] opacity-80 truncate">
            {formatEventDetail(event)}
          </div>
        </div>
      </div>
      <div className="text-right text-[11px] opacity-80 shrink-0">
        {new Date(event.createdAt).toLocaleString('pl-PL')}
      </div>
    </li>
  );
}

function ChargeRow({ charge }: { charge: AutoscalingChargeDto }) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-xl border border-rose-400/20 bg-rose-400/5 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <Coins className="h-4 w-4 shrink-0 text-rose-300" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">Naliczenie autoskalowania</div>
          <div className="text-[11px] text-neutral-400 truncate">
            {charge.description ?? 'Naliczenie autoskalowania (blok 15 min)'}
          </div>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-bold text-rose-200 tabular-nums">
          −{formatCredits(charge.amount)}
        </div>
        <div className="text-[11px] text-neutral-500">
          {new Date(charge.createdAt).toLocaleString('pl-PL')}
        </div>
      </div>
    </li>
  );
}

function formatEventDetail(event: AutoscalingEventDto): string {
  const prefix = event.resource ? `${event.resource} ` : '';
  if (event.fromValue !== null && event.toValue !== null) {
    return (
      prefix +
      `${formatScaledValue(event.resource, event.fromValue)} → ${formatScaledValue(event.resource, event.toValue)}`
    );
  }
  return prefix + (event.reason ?? '—');
}

function formatScaledValue(resource: string | null, value: number): string {
  if (resource === 'CPU') return `+${value}%`;
  if (resource === 'RAM' || resource === 'DISK') {
    const gb = value / 1024;
    const label = gb % 1 === 0 ? `${gb.toFixed(0)} GB` : `${gb.toFixed(1)} GB`;
    return `+${label}`;
  }
  return String(value);
}

function humaniseEventType(type: string): string {
  switch (type) {
    case 'SCALE_UP':
      return 'Zwiększono zasoby';
    case 'SCALE_DOWN':
      return 'Zmniejszono zasoby';
    case 'AUTOSCALING_ENABLED':
      return 'Włączono autoskalowanie';
    case 'AUTOSCALING_DISABLED':
      return 'Wyłączono autoskalowanie';
    case 'CAP_REACHED':
      return 'Osiągnięto limit miesięczny';
    case 'WALLET_EMPTY':
      return 'Wstrzymano: pusty portfel';
    default:
      return type.replace(/_/g, ' ').toLowerCase();
  }
}
