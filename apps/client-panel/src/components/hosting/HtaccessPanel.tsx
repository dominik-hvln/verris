'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { SectionHead, Switch } from '@/components/panel/v2';
import { Select } from '@/components/panel/select';
import {
  fetchHtaccess,
  readHtaccess,
  saveHtaccess,
  type HtaccessStatus,
  type HtaccessUstawienia,
} from '@/app/dashboard/services/[id]/hosting-htaccess-actions';

const INPUT = 'w-full rounded-[7px] border border-line bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-data';
const BTN = 'inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50';
const BLEDY = [
  ['e404', '404 — nie znaleziono', '/404.html'],
  ['e403', '403 — brak dostępu', '/403.html'],
  ['e500', '500 — błąd serwera', '/500.html'],
] as const;

/**
 * B-17 / B-18 / G-07 — ustawienia strony zapisywane w .htaccess (blok Verris; reguły WordPressa
 * i własne zostają). Po zapisie sprawdzamy stronę — gdy serwer zacznie zwracać 5xx, wraca poprzedni plik.
 */
export function HtaccessPanel({ serviceId, domain }: { serviceId: string; domain: string }) {
  const [stan, setStan] = useState<HtaccessStatus | null>(null);
  const [bladWczytania, setBladWczytania] = useState<string | null>(null);
  const [form, setForm] = useState<HtaccessUstawienia | null>(null);
  const [pending, start] = useTransition();
  const odczytZlecony = useRef(false);

  const przyjmij = useCallback((s: HtaccessStatus) => {
    setStan(s);
    if (!s.wToku && s.ustawienia) setForm(s.ustawienia);
  }, []);
  const odswiez = useCallback(
    () =>
      fetchHtaccess(serviceId, domain).then((r) => {
        if (r.ok) {
          przyjmij(r.status);
          setBladWczytania(null);
        } else setBladWczytania(r.error);
      }),
    [serviceId, domain, przyjmij],
  );
  useEffect(() => {
    void odswiez();
  }, [odswiez]);
  // Pierwsze wejście: jednorazowy odczyt pliku, żeby formularz pokazał to, co naprawdę jest na serwerze.
  useEffect(() => {
    if (!stan || stan.wToku || stan.ustawienia || stan.blad || odczytZlecony.current) return;
    odczytZlecony.current = true;
    void readHtaccess(serviceId, domain).then((r) => r.ok && przyjmij(r.status));
  }, [stan, serviceId, domain, przyjmij]);
  useEffect(() => {
    if (!stan?.wToku) return;
    const t = setInterval(() => void odswiez(), 5_000);
    return () => clearInterval(t);
  }, [stan?.wToku, odswiez]);

  const zapisz = () =>
    form &&
    start(async () => {
      const r = await saveHtaccess(serviceId, domain, form);
      if (r.ok) {
        przyjmij(r.status);
        toast.success('Zapis zlecony — sprawdzimy stronę po zmianie.');
      } else toast.error(r.error);
    });
  const odczytaj = () =>
    start(async () => {
      const r = await readHtaccess(serviceId, domain);
      if (r.ok) przyjmij(r.status);
      else toast.error(r.error);
    });

  const zajete = pending || !stan || stan.wToku;
  const f = form ?? { indexes: 'default' as const, hsts: false, e403: '', e404: '', e500: '' };
  const ustaw = (z: Partial<HtaccessUstawienia>) => setForm({ ...f, ...z });

  return (
    <section className="mt-8">
      <SectionHead
        title="Ustawienia serwera WWW"
        desc="Zapisywane w pliku .htaccess strony, w osobnym bloku — reguły WordPressa i Twoje własne zostają bez zmian."
      />
      {bladWczytania && !stan ? <p role="alert" className="m-0 my-2 rounded-[8px] border border-line px-3 py-2 text-[13px] text-crit">Nie udało się wczytać: {bladWczytania}</p> : null}
      <div className="rounded-[10px] border border-line bg-card">
        {stan?.wToku ? <p className="m-0 border-b border-line px-4 py-2 text-[13px] text-muted-foreground">Trwa odczyt albo zapis pliku .htaccess…</p> : null}
        {stan?.blad ? <p className="m-0 border-b border-line px-4 py-2 text-[13px] text-crit">{stan.blad}</p> : null}
        <div className="grid gap-4 px-4 py-3 sm:grid-cols-2">
          <div className="min-w-0">
            <span className="mb-1 block text-[13px] font-medium text-foreground">Lista plików w katalogu bez strony głównej</span>
            <Select
              aria-label="Lista plików w katalogu"
              value={f.indexes}
              onChange={(v) => ustaw({ indexes: v as HtaccessUstawienia['indexes'] })}
              options={[
                { value: 'default', label: 'Domyślnie (ustawienie serwera)' },
                { value: 'off', label: 'Ukryta — zalecane' },
                { value: 'on', label: 'Widoczna' },
              ]}
              className="w-full"
            />
            <p className="m-0 mt-1 text-[12px] text-muted-foreground">Gdy katalog nie ma index.html ani index.php, odwiedzający zobaczy listę jego plików albo błąd 403.</p>
          </div>
          <div className="min-w-0">
            <span className="mb-1 block text-[13px] font-medium text-foreground">Wymuszanie HTTPS w przeglądarkach (HSTS)</span>
            <div className="flex items-center gap-2 text-[13px] text-foreground">
              <Switch checked={f.hsts} onChange={(v) => ustaw({ hsts: v })} label="HSTS" disabled={zajete} /> {f.hsts ? 'Włączone na rok' : 'Wyłączone'}
            </div>
            <p className="m-0 mt-1 text-[12px] text-muted-foreground">
              Przeglądarka przez rok łączy się ze stroną tylko przez HTTPS. Włącz, gdy certyfikat SSL działa — wyłączenie zadziała u odwiedzających dopiero po tym czasie.
            </p>
          </div>
        </div>
        <div className="border-t border-line px-4 py-3">
          <span className="block text-[13px] font-medium text-foreground">Własne strony błędów</span>
          <p className="m-0 mt-0.5 text-[12px] text-muted-foreground">Ścieżka pliku w katalogu strony, np. /404.html. Puste pole — strona błędu serwera.</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {BLEDY.map(([k, etykieta, przyklad]) => (
              <label key={k} className="block min-w-0 text-[13px] font-medium text-foreground">
                {etykieta}
                <input value={f[k]} onChange={(e) => ustaw({ [k]: e.target.value })} placeholder={przyklad} maxLength={201} className={`mt-1 ${INPUT} font-mono`} />
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
          <span className="text-[12px] text-muted-foreground">
            {stan?.odczytano ? `Stan pliku z ${new Date(stan.odczytano).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.` : 'Plik nie został jeszcze odczytany.'}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={odczytaj} disabled={zajete} className={BTN}>
              Odczytaj ponownie
            </button>
            <button type="button" onClick={zapisz} disabled={zajete || !form} className={BTN}>
              Zapisz
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
