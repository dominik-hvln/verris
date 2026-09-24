'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/panel/v2';
import { potwierdz } from '@/components/panel/potwierdz';
import { fetchRedis, setRedis, type RedisStatus } from '@/app/dashboard/services/[id]/hosting-redis-actions';

/**
 * D-15/J-03 — Redis konta: własna instancja, tylko przez gniazdo w katalogu konta. WordPress
 * podłącza się w zakładce WordPress przy stronie; inne aplikacje — ścieżką gniazda.
 */
export function RedisPanel({ serviceId }: { serviceId: string }) {
  const [stan, setStan] = useState<RedisStatus | null>(null);
  const [pending, start] = useTransition();

  const odswiez = useCallback(
    () =>
      fetchRedis(serviceId).then((r) => {
        if (r.ok) setStan(r.status);
        else toast.error(r.error);
      }),
    [serviceId],
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
    if (!wlacz && !(await potwierdz('Wyłączyć Redis? Strony, które z niego korzystają, stracą cache obiektowy (zadziałają, ale wolniej).', { akcja: 'Wyłącz' }))) return;
    start(async () => {
      const r = await setRedis(serviceId, wlacz);
      if (r.ok) {
        setStan(r.status);
        toast.success(wlacz ? 'Włączanie Redisa zlecone — gotowe w ciągu minuty.' : 'Wyłączanie Redisa zlecone.');
      } else toast.error(r.error);
    });
  };

  return (
    <section className="rounded-[10px] border border-line bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h3 className="m-0 text-[15px] font-bold text-foreground">Redis (cache obiektowy)</h3>
          <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">
            Własna instancja dla konta, {stan?.pamiecMb ?? 64} MB pamięci, dostęp tylko z Twojego konta. Przyspiesza WordPressa, WooCommerce i inne aplikacje z cache.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stan?.wToku ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden /> : null}
          <Switch checked={Boolean(stan?.wlaczony)} onChange={(v) => void przelacz(v)} label="Redis" disabled={pending || !stan || stan.wToku} />
        </div>
      </header>
      {stan?.wlaczony && stan.gniazdo ? (
        <p className="m-0 border-t border-line px-4 py-3 text-[13px] text-muted-foreground">
          Gniazdo: <span className="break-all font-mono text-foreground">{stan.gniazdo}</span>. WordPress podłączysz jednym kliknięciem w zakładce WordPress przy stronie.
        </p>
      ) : null}
      {stan?.blad ? <p className="m-0 border-t border-line px-4 py-3 text-[13px] text-crit">{stan.blad}</p> : null}
    </section>
  );
}
