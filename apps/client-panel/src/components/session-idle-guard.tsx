'use client';

import { useEffect, useRef } from 'react';
import { logoutAction } from '@/app/dashboard/actions';

const FALLBACK_IDLE_MINUTES = 60;
const CHECK_INTERVAL_MS = 30_000;
const STORAGE_KEY = 'verris_client_last_activity';

type Props = {
  idleMinutes?: number;
};

/**
 * Wylogowuje klienta po braku aktywności (ruch myszy, klawiatura, dotyk, scroll).
 */
export function SessionIdleGuard({ idleMinutes = FALLBACK_IDLE_MINUTES }: Props) {
  const idleMs = Math.max(5, idleMinutes) * 60 * 1000;
  const loggingOut = useRef(false);

  useEffect(() => {
    const touch = () => {
      try {
        sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
    };

    touch();
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    for (const ev of events) {
      window.addEventListener(ev, touch, { passive: true });
    }

    const interval = window.setInterval(() => {
      if (loggingOut.current) return;
      let last = Date.now();
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) last = Number.parseInt(raw, 10) || last;
      } catch {
        /* ignore */
      }
      if (Date.now() - last >= idleMs) {
        loggingOut.current = true;
        void logoutAction();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, touch);
      }
      window.clearInterval(interval);
    };
  }, [idleMs]);

  return null;
}
