'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Monitor, RefreshCw, X } from 'lucide-react';
import type RFB from '@novnc/novnc';
import { requestVpsConsoleAction } from './vps-actions';

const LIMIT_LACZENIA_MS = 20_000;

type Stan = { typ: 'laczenie' } | { typ: 'polaczono' } | { typ: 'rozlaczono' } | { typ: 'blad'; tresc: string };

/**
 * Q-07 — konsola VPS-a w przeglądarce (noVNC, https://github.com/novnc/noVNC/blob/master/docs/API.md).
 * Sesję (adres websocket + jednorazowe hasło) wydaje nasze API wyłącznie właścicielowi; hasło trafia tylko do
 * tego połączenia — nie wyświetlamy go i nigdzie nie zapisujemy. Adres jest ważny minutę, więc łączymy od razu.
 */
export function VpsKonsola({ vpsId, onClose }: { vpsId: string; onClose: () => void }) {
  const ekran = useRef<HTMLDivElement>(null);
  const rfb = useRef<RFB | null>(null);
  const [stan, setStan] = useState<Stan>({ typ: 'laczenie' });
  const [proba, setProba] = useState(0);

  useEffect(() => {
    let anulowano = false;
    // Websocket zablokowany (np. CSP albo sieć) nie zawsze kończy się zdarzeniem noVNC — bez limitu panel
    // wisiał na „łączenie…” (D3 06.10). Po czasie: błąd z możliwością ponowienia.
    const limit = setTimeout(
      () => setStan((s) => (s.typ === 'laczenie' ? { typ: 'blad', tresc: 'Nie udało się połączyć z konsolą. Spróbuj ponownie.' } : s)),
      LIMIT_LACZENIA_MS,
    );
    void (async () => {
      const sesja = await requestVpsConsoleAction(vpsId);
      if (anulowano) return;
      if (!sesja.ok || !sesja.data) {
        setStan({ typ: 'blad', tresc: sesja.ok ? 'Nie udało się otworzyć konsoli.' : sesja.error });
        return;
      }
      // Import w przeglądarce — noVNC korzysta z API okna i nie działa przy renderowaniu na serwerze.
      const { default: RFBKlasa } = await import('@novnc/novnc');
      if (anulowano || !ekran.current) return;
      const polaczenie = new RFBKlasa(ekran.current, sesja.data.wssUrl, { credentials: { password: sesja.data.password } });
      polaczenie.scaleViewport = true;
      polaczenie.addEventListener('connect', () => setStan({ typ: 'polaczono' }));
      polaczenie.addEventListener('disconnect', () => setStan((s) => (s.typ === 'blad' ? s : { typ: 'rozlaczono' })));
      polaczenie.addEventListener('securityfailure', () =>
        setStan({ typ: 'blad', tresc: 'Sesja konsoli wygasła albo została odrzucona. Połącz ponownie.' }),
      );
      rfb.current = polaczenie;
    })();
    return () => {
      anulowano = true;
      clearTimeout(limit);
      rfb.current?.disconnect();
      rfb.current = null;
    };
  }, [vpsId, proba]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <Monitor className="h-4 w-4 text-sky-300" /> Konsola
          <span role="status" className="text-[11px] font-normal text-neutral-400">
            {stan.typ === 'laczenie'
              ? 'łączenie…'
              : stan.typ === 'polaczono'
                ? 'połączono'
                : stan.typ === 'rozlaczono'
                  ? 'rozłączono'
                  : ''}
          </span>
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => rfb.current?.sendCtrlAltDel()}
            disabled={stan.typ !== 'polaczono'}
            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-neutral-200 hover:bg-white/5 disabled:opacity-40"
          >
            Ctrl+Alt+Del
          </button>
          <button
            type="button"
            onClick={() => {
              setStan({ typ: 'laczenie' });
              setProba((p) => p + 1);
            }}
            disabled={stan.typ === 'laczenie'}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-neutral-200 hover:bg-white/5 disabled:opacity-40"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Połącz ponownie
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij konsolę"
            className="rounded-lg border border-white/10 p-1 text-neutral-300 hover:bg-white/5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {stan.typ === 'blad' ? <p className="text-xs text-rose-300">{stan.tresc}</p> : null}
      {stan.typ === 'laczenie' ? (
        <p className="flex items-center gap-2 text-xs text-neutral-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Otwieranie sesji konsoli…
        </p>
      ) : null}
      <div ref={ekran} className="h-[420px] w-full overflow-hidden rounded-lg border border-white/10 bg-black" />
      <p className="text-[11px] text-neutral-500">
        Zaloguj się kontem systemu serwera (np. root). Sesja jest jednorazowa — po rozłączeniu otwórz nową.
      </p>
    </div>
  );
}
