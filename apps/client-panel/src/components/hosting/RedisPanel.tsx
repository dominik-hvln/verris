'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/panel/v2';
import { potwierdz } from '@/components/panel/potwierdz';
import { fetchRedis, setRedis, type RedisStatus, type Silnik } from '@/app/dashboard/services/[id]/hosting-redis-actions';

const TEKSTY: Record<Silnik, { tytul: string; nazwa: string; opis: (mb: number) => string; wylacz: string; gniazdo: string }> = {
  redis: {
    tytul: 'Redis (cache obiektowy)',
    nazwa: 'Redis',
    opis: (mb) => `Własna instancja dla konta, ${mb} MB pamięci, dostęp tylko z Twojego konta. Przyspiesza WordPressa, WooCommerce i inne aplikacje z cache.`,
    wylacz: 'Wyłączyć Redis? Strony, które z niego korzystają, stracą cache obiektowy (zadziałają, ale wolniej).',
    gniazdo: 'WordPress podłączysz jednym kliknięciem w zakładce WordPress przy stronie.',
  },
  memcached: {
    tytul: 'Memcached',
    nazwa: 'Memcached',
    opis: (mb) => `Własna instancja dla konta, ${mb} MB pamięci, tylko przez gniazdo w katalogu konta. Dla aplikacji, które wolą Memcached (np. LiteSpeed Cache, Drupal, Magento).`,
    wylacz: 'Wyłączyć Memcached? Aplikacje, które z niego korzystają, stracą cache (zadziałają, ale wolniej).',
    gniazdo: 'W aplikacji wpisz ścieżkę gniazda zamiast hosta i portu.',
  },
};

/**
 * D-15/J-03 — Redis konta: własna instancja, tylko przez gniazdo w katalogu konta. WordPress
 * podłącza się w zakładce WordPress przy stronie; inne aplikacje — ścieżką gniazda.
 */
export function RedisPanel({ serviceId, silnik = 'redis' }: { serviceId: string; silnik?: Silnik }) {
  const T = TEKSTY[silnik];
  const [stan, setStan] = useState<RedisStatus | null>(null);
  const [pending, start] = useTransition();

  const odswiez = useCallback(
    () =>
      fetchRedis(serviceId, silnik).then((r) => {
        if (r.ok) setStan(r.status);
        else toast.error(r.error);
      }),
    [serviceId, silnik],
  );
  useEffect(() => {
    void odswiez();
  }, [odswiez]);
  useEffect(() => {
    if (!stan?.wToku) return;
    const t = setInterval(() => void odswiez(), 6_000);
    return () => clearInterval(t);
  }, [stan?.wToku, odswiez]);

  const przelacz = async (wlacz: boolean) => {
    if (!wlacz && !(await potwierdz(T.wylacz, { akcja: 'Wyłącz' }))) return;
    start(async () => {
      const r = await setRedis(serviceId, wlacz, silnik);
      if (r.ok) {
        setStan(r.status);
        toast.success(wlacz ? `Włączanie: ${T.nazwa} — gotowe w ciągu minuty.` : `Wyłączanie: ${T.nazwa} zlecone.`);
      } else toast.error(r.error);
    });
  };

  return (
    <section className="rounded-[10px] border border-line bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h3 className="m-0 text-[15px] font-bold text-foreground">{T.tytul}</h3>
          <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">
            {T.opis(stan?.pamiecMb ?? 64)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stan?.wToku ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden /> : null}
          <Switch checked={Boolean(stan?.wlaczony)} onChange={(v) => void przelacz(v)} label={T.nazwa} disabled={pending || !stan || stan.wToku} />
        </div>
      </header>
      {stan?.wlaczony && stan.gniazdo ? (
        <p className="m-0 border-t border-line px-4 py-3 text-[13px] text-muted-foreground">
          Gniazdo: <span className="break-all font-mono text-foreground">{stan.gniazdo}</span>. {T.gniazdo}
        </p>
      ) : null}
      {stan?.blad ? <p className="m-0 border-t border-line px-4 py-3 text-[13px] text-crit">{stan.blad}</p> : null}
    </section>
  );
}
