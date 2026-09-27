'use client';

import { useEffect, useRef, useState } from 'react';
import { Timer } from 'lucide-react';
import { logoutAction, odswiezSesjeAction } from '@/app/dashboard/actions';

const FALLBACK_IDLE_MINUTES = 60;
const STORAGE_KEY = 'verris_client_last_activity';
/** Co ile (najwyżej) przedłużać ciasteczko sesji przy aktywności — musi być < ZAPAS_ODSWIEZANIA_MIN. */
const ODSWIEZANIE_MS = 4 * 60_000;

type Props = {
  idleMinutes?: number;
};

function ostatniaAktywnosc(): number {
  try {
    return Number.parseInt(localStorage.getItem(STORAGE_KEY) ?? '', 10) || Date.now();
  } catch {
    return Date.now();
  }
}

/**
 * Wylogowuje klienta po braku aktywności (ruch myszy, klawiatura, dotyk, scroll) i pokazuje w
 * pasku licznik do końca sesji. Aktywność jest wspólna dla kart (localStorage) — wcześniej
 * bezczynna karta wylogowywała klienta pracującego w innej. Przy aktywności ciasteczko sesji
 * jest przedłużane, więc po zamknięciu przeglądarki sesja kończy się po tym samym czasie.
 */
export function SessionIdleGuard({ idleMinutes = FALLBACK_IDLE_MINUTES }: Props) {
  const idleMs = Math.max(5, idleMinutes) * 60 * 1000;
  const loggingOut = useRef(false);
  const odswiezono = useRef(0);
  const [zostalo, setZostalo] = useState(idleMs);

  useEffect(() => {
    let zapisano = 0;
    const touch = () => {
      const teraz = Date.now();
      if (teraz - zapisano < 1000) return;
      zapisano = teraz;
      try {
        localStorage.setItem(STORAGE_KEY, String(teraz));
      } catch {
        /* ignore */
      }
      if (teraz - odswiezono.current >= ODSWIEZANIE_MS) {
        odswiezono.current = teraz;
        void odswiezSesjeAction(idleMinutes).catch(() => undefined);
      }
    };

    touch();
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    for (const ev of events) {
      window.addEventListener(ev, touch, { passive: true });
    }

    const interval = window.setInterval(() => {
      if (loggingOut.current) return;
      const reszta = idleMs - (Date.now() - ostatniaAktywnosc());
      setZostalo(Math.max(0, reszta));
      if (reszta <= 0) {
        loggingOut.current = true;
        void logoutAction();
      }
    }, 1000);

    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, touch);
      }
      window.clearInterval(interval);
    };
  }, [idleMs, idleMinutes]);

  const min = Math.floor(zostalo / 60_000);
  const sek = Math.floor((zostalo % 60_000) / 1000);
  const konczySie = zostalo < 5 * 60_000;

  return (
    <span
      role="timer"
      title={`Sesja wygaśnie po ${idleMinutes} min bez aktywności — każda akcja w panelu liczy czas od nowa.`}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-xs tabular-nums ${
        konczySie ? 'border-rose-400/60 text-rose-400' : 'border-line text-muted-foreground'
      }`}
    >
      <Timer className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">Do końca sesji: </span>
      {min}:{sek.toString().padStart(2, '0')}
    </span>
  );
}
