'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { SectionHead } from '@/components/panel/v2';
import { fetchDocroot, saveDocroot } from '@/app/dashboard/services/[id]/hosting-htaccess-actions';

const INPUT = 'w-full min-w-0 rounded-[7px] border border-line bg-card px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-data';
const BTN = 'inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50';

/**
 * A-06 — katalog, z którego domena serwuje stronę (np. public_html/public dla Laravela).
 * Subdomeny zostają przy swoich katalogach. Zmiana wchodzi po przebudowie konfiguracji serwera (do kilku minut).
 */
export function DocrootPanel({ serviceId, domain }: { serviceId: string; domain: string }) {
  const [obecny, setObecny] = useState<string | null>(null);
  const [katalog, setKatalog] = useState('');
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    void fetchDocroot(serviceId, domain).then((r) => {
      if (r.ok) {
        setObecny(r.docroot.katalog);
        setKatalog(r.docroot.katalog);
        setBlad(null);
      } else setBlad(r.error);
    });
  }, [serviceId, domain]);

  const zapisz = (wartosc: string) =>
    start(async () => {
      const r = await saveDocroot(serviceId, domain, wartosc);
      if (r.ok) {
        setObecny(r.docroot.katalog);
        setKatalog(r.docroot.katalog);
        toast.success('Zapisano — serwer przełączy katalog w ciągu kilku minut.');
      } else toast.error(r.error);
    });

  const zajete = pending || obecny === null;
  return (
    <section className="mt-8">
      <SectionHead
        title="Katalog główny strony"
        desc="Katalog, z którego domena serwuje stronę — np. public dla Laravela. Subdomeny zostają przy swoich katalogach."
      />
      {blad ? <p role="alert" className="m-0 my-2 rounded-[8px] border border-line px-3 py-2 text-[13px] text-crit">Nie udało się wczytać: {blad}</p> : null}
      <div className="rounded-[10px] border border-line bg-card px-4 py-3">
        <label htmlFor="docroot-katalog" className="mb-1 block text-[13px] font-medium text-foreground">Katalog</label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">domains/{domain}/public_html/</span>
          <input
            id="docroot-katalog"
            value={katalog}
            onChange={(e) => setKatalog(e.target.value)}
            placeholder="(sam public_html)"
            maxLength={260}
            disabled={zajete}
            className={`${INPUT} flex-1 basis-40`}
          />
        </div>
        <p className="m-0 mt-1 text-[12px] text-muted-foreground">Katalog musi już istnieć. Puste pole — strona z public_html.</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] text-muted-foreground">
            {obecny === null ? (blad ? 'Nie udało się odczytać ustawienia z serwera.' : 'Wczytywanie…') : `Teraz: public_html${obecny ? `/${obecny}` : ''}`}
          </span>
          <div className="flex gap-2">
            {obecny ? (
              <button type="button" onClick={() => zapisz('')} disabled={zajete} className={BTN}>
                Przywróć public_html
              </button>
            ) : null}
            <button type="button" onClick={() => zapisz(katalog)} disabled={zajete || katalog.trim() === obecny} className={BTN}>
              Zapisz
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
