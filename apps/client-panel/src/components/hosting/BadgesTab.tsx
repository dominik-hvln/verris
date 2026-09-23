'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Kpi, KpiStrip, SectionHead, StatusPill } from '@/components/panel/v2';
import { cx } from '@/components/panel/cx';

interface BadgesData {
  apiBase: string;
  domain: string;
  seal: { visible: boolean; reason: string; label: string };
  uptime: { monitorOn: boolean; pct30: number | null };
  eco: { token: string | null; tier: string; points: number; impressions: number };
  referral: {
    programEnabled: boolean;
    status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
    code: string | null;
    commissionPct: number;
    clicks: number;
    referrals: number;
    earned: number;
  };
}

type Kind = 'pieczec' | 'dostepnosc' | 'polecenie' | 'eko';
type Motyw = 'ciemny' | 'jasny';

const KINDS: { id: Kind; name: string; tag: string; desc: string }[] = [
  { id: 'pieczec', name: 'Pieczęć zaufania', tag: 'interaktywna', desc: 'SSL, dostępność i dane w UE po kliknięciu.' },
  { id: 'dostepnosc', name: 'Dostępność na żywo', tag: 'interaktywna', desc: 'Pasek dni z monitora Twojej strony.' },
  { id: 'polecenie', name: 'Polecenie z prowizją', tag: 'zarabia', desc: 'Stopka „działa na verris” z Twoim kodem.' },
  { id: 'eko', name: 'EKO i stopki', tag: 'statyczna', desc: 'Obrazek z linkiem — działa wszędzie.' },
];

const pl = (n: number, d = 2) => n.toLocaleString('pl-PL', { minimumFractionDigits: d, maximumFractionDigits: d });

function embedCode(api: string, kind: Kind, id: string, motyw: Motyw, extra = ''): string {
  return `<div data-verris-badge="${kind}" data-id="${id}"${motyw === 'jasny' ? ' data-motyw="jasny"' : ''}${extra}></div>\n<script src="${api}/public/badges/v1.js" async></script>`;
}

/**
 * Podgląd = ta sama ramka, która pojawi się na stronie klienta (API wpuszcza
 * panel jako dozwoloną domenę). Rozmiar z postMessage, jak w loaderze v1.js.
 */
function FramePreview({ src }: { src: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, cw: 0, ch: 0, fluid: false });
  useEffect(() => {
    setSize({ w: 0, h: 0, cw: 0, ch: 0, fluid: false });
    const on = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || e.data?.v !== 'verris-badge') return;
      const n = (x: unknown) => (typeof x === 'number' && x >= 0 && x < 4000 ? x : 0);
      setSize({ w: n(e.data.w), h: n(e.data.h), cw: n(e.data.cw), ch: n(e.data.ch), fluid: e.data.w === null });
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [src]);
  return (
    <div className="relative" style={{ width: size.fluid ? '100%' : size.cw, height: size.ch }}>
      <iframe
        ref={ref}
        src={src}
        title="Podgląd badge"
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="origin"
        className="absolute bottom-0 left-0 z-10 border-0 bg-transparent"
        style={{ width: size.fluid ? '100%' : size.w, height: size.h }}
      />
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-1 rounded-[9px] bg-raised p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cx('h-8 rounded-[7px] border-0 px-3 text-[13px] font-semibold', value === o.id ? 'bg-card text-foreground shadow-sm' : 'bg-transparent text-muted-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Badge na stronę — wybór, podgląd na żywo, kod do wklejenia i co to daje. */
export default function BadgesTab({ serviceId }: { serviceId: string }) {
  const [data, setData] = useState<BadgesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('pieczec');
  const [motyw, setMotyw] = useState<Motyw>('ciemny');
  const [wariant, setWariant] = useState<'pelny' | 'mini'>('pelny');
  const [eko, setEko] = useState<'eko' | 'znak' | 'hostowane'>('eko');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/services/${serviceId}/badges`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message ?? 'Nie udało się wczytać badge.');
      setData(j as BadgesData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wczytać badge.');
    }
  }, [serviceId]);
  useEffect(() => void load(), [load]);

  if (error) return <p className="text-sm text-muted-foreground">{error}</p>;
  if (!data) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
      </p>
    );
  }

  const api = data.apiBase;
  const q = motyw === 'jasny' ? 'motyw=jasny' : '';
  const refCode = data.referral.status === 'APPROVED' && data.referral.code ? data.referral.code : 'verris';
  const ekoSrc = data.eco.token ? `${api}/public/badges/eko/${data.eco.token}.svg?motyw=${motyw}&wariant=${eko}` : null;

  const view = {
    pieczec: {
      src: `${api}/public/badges/ramka/pieczec/${serviceId}${q ? `?${q}` : ''}`,
      code: embedCode(api, 'pieczec', serviceId, motyw),
      state: { ok: data.seal.visible, text: data.seal.label },
    },
    dostepnosc: {
      src: `${api}/public/badges/ramka/dostepnosc/${serviceId}?${[q, wariant === 'mini' ? 'wariant=mini' : ''].filter(Boolean).join('&')}`,
      code: embedCode(api, 'dostepnosc', serviceId, motyw, wariant === 'mini' ? ' data-wariant="mini"' : ''),
      state: data.uptime.monitorOn
        ? { ok: true, text: 'Monitor strony włączony — badge pokazuje jego dane.' }
        : { ok: false, text: 'Włącz monitoring strony (zakładka Monitoring) — bez niego badge się nie wyświetla.' },
    },
    polecenie: {
      src: `${api}/public/badges/ramka/polecenie/${refCode}${q ? `?${q}` : ''}`,
      code: embedCode(api, 'polecenie', refCode, motyw),
      state:
        data.referral.status === 'APPROVED'
          ? { ok: true, text: `Program partnerski aktywny — ${data.referral.commissionPct}% od każdej płatności poleconego klienta trafia do portfela.` }
          : data.referral.status === 'PENDING'
            ? { ok: false, text: 'Zgłoszenie do programu partnerskiego czeka na akceptację. Do tego czasu badge działa bez prowizji.' }
            : { ok: false, text: 'Badge działa bez prowizji. Dołącz do programu poleceń (menu: Polecenia), żeby zarabiać na każdym kliencie z Twojej strony.' },
    },
    eko: {
      src: null,
      code: ekoSrc ? `<a href="https://verris.pl" target="_blank" rel="noopener"><img src="${ekoSrc}" alt="Hosting Verris" height="${eko === 'eko' ? 44 : eko === 'znak' ? 28 : 20}"></a>` : '',
      state: { ok: !!ekoSrc, text: ekoSrc ? 'Widoczny zawsze. Wyświetlenia z panelu nie są liczone.' : 'Brak tokenu badge — napisz do nas.' },
    },
  }[kind];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(view.code);
      toast.success('Skopiowano kod badge');
    } catch {
      toast.error('Nie udało się skopiować — zaznacz kod ręcznie.');
    }
  };

  return (
    <div className="space-y-5">
      <SectionHead
        title="Badge na stronę"
        desc={`Wklejasz kod raz na ${data.domain}, a dane odświeżają się same. Bez ciasteczek i bez zewnętrznych skryptów poza jednym małym loaderem.`}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            aria-pressed={kind === k.id}
            onClick={() => setKind(k.id)}
            className={cx(
              'flex min-h-[96px] flex-col items-start gap-1.5 rounded-[10px] border bg-card p-4 text-left',
              kind === k.id ? 'border-data' : 'border-line hover:border-line-strong',
            )}
          >
            <span className="flex w-full items-center gap-2">
              <span className="text-[14.5px] font-semibold text-foreground">{k.name}</span>
              <span className="flex-1" />
              <span className={cx('font-mono text-[10px] uppercase tracking-[0.06em]', k.id === 'polecenie' ? 'text-warn' : 'text-data-hi')}>{k.tag}</span>
            </span>
            <span className="text-[13px] leading-snug text-muted-foreground">{k.desc}</span>
          </button>
        ))}
      </div>

      <section className="rounded-[10px] border border-line bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="m-0 font-display text-[15px] font-bold text-foreground">Podgląd</h3>
          <div className="flex flex-wrap gap-2">
            {kind === 'dostepnosc' ? (
              <Seg label="Wariant" value={wariant} onChange={setWariant} options={[{ id: 'pelny', label: 'Pełny' }, { id: 'mini', label: 'Do stopki' }]} />
            ) : null}
            {kind === 'eko' ? (
              <Seg label="Wariant" value={eko} onChange={setEko} options={[{ id: 'eko', label: 'EKO' }, { id: 'znak', label: 'Znak' }, { id: 'hostowane', label: 'Tekst' }]} />
            ) : null}
            <Seg label="Motyw" value={motyw} onChange={setMotyw} options={[{ id: 'ciemny', label: 'Ciemny' }, { id: 'jasny', label: 'Jasny' }]} />
          </div>
        </div>
        <div
          className={cx(
            'mt-3 flex min-h-[200px] items-end justify-center rounded-[8px] border border-dashed p-6',
            motyw === 'jasny' ? 'border-neutral-300 bg-[#F4F4EE]' : 'border-line-strong bg-[#16211B]',
          )}
        >
          {view.src ? (
            <FramePreview key={view.src} src={view.src} />
          ) : ekoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ekoSrc} alt="Podgląd badge EKO" />
          ) : null}
        </div>
        <div className="mt-3 flex items-start gap-2">
          <StatusPill tone={view.state.ok ? 'data' : 'warn'}>{view.state.ok ? 'Działa' : 'Uwaga'}</StatusPill>
          <span className="text-[13px] text-muted-foreground">{view.state.text}</span>
        </div>
      </section>

      <section className="rounded-[10px] border border-line bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="m-0 font-display text-[15px] font-bold text-foreground">Kod do wklejenia</h3>
            <p className="mt-1 text-[13px] text-muted-foreground">Wklej w stopce strony (WordPress: Wygląd → Widżety → blok „Własny HTML”).</p>
          </div>
          <button type="button" onClick={copy} disabled={!view.code} className="h-10 rounded-[8px] border-0 bg-primary px-4 text-[14px] font-semibold text-primary-foreground disabled:opacity-50">
            Kopiuj kod
          </button>
        </div>
        <pre className="mt-3 overflow-hidden whitespace-pre-wrap break-all rounded-[8px] bg-raised p-3 font-mono text-[12px] leading-relaxed text-muted-foreground">{view.code}</pre>
      </section>

      <KpiStrip>
        <Kpi label="Wyświetlenia badge" value={data.eco.impressions.toLocaleString('pl-PL')} foot={<span>wszystkie badge, od początku</span>} />
        <Kpi label="Punkty EKO" value={data.eco.points} foot={<span>poziom {data.eco.tier}</span>} />
        <Kpi label="Kliknięcia w polecenie" value={data.referral.clicks} foot={<span>{data.referral.referrals} poleconych kont</span>} />
        <Kpi label="Prowizja" value={pl(data.referral.earned)} unit="zł" foot={<span>{data.referral.status === 'APPROVED' ? 'łącznie z programu poleceń' : 'po dołączeniu do programu'}</span>} />
      </KpiStrip>
    </div>
  );
}
