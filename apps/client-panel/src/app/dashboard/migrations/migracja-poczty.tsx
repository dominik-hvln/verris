'use client';

import { useEffect, useState } from 'react';
import { Button } from '@verris/ui';
import { Select } from '@/components/panel';
import { Checkbox } from '@/components/panel/checkbox';
import { fetchHostingEmailAction } from '@/app/dashboard/services/[id]/hosting-email-actions';
import { createMigrationBundleAction, preflightMigrationAction } from './actions';
import type { PreflightCheckResult, PreflightSummary } from './types';

/**
 * E-21 — przeniesienie jednej skrzynki: najpierw dane starej skrzynki i ich test, potem wybór skrzynki
 * na tym koncie i jej sprawdzenie, na końcu start. Uwaga Dominika (t1 02.10): kreator stron kazał wpisać
 * jeden adres na obie strony — nie dało się przenieść poczty do skrzynki o innym adresie.
 * Do skrzynki docelowej piszemy na węźle bez jej hasła (API pilnuje, że jest na domenie tej usługi).
 */
const input = 'w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white';
const labelText = 'text-xs text-neutral-400';

type Wynik = { ok: boolean; tekst: string } | null;

export function MigracjaPoczty({ serviceId, onQueued }: { serviceId: string; onQueued?: () => void }) {
  const [host, setHost] = useState('');
  const [port, setPort] = useState(993);
  const [login, setLogin] = useState('');
  const [haslo, setHaslo] = useState('');
  const [testZrodla, setTestZrodla] = useState<Wynik>(null);
  const [testujeZrodlo, setTestujeZrodlo] = useState(false);

  const [skrzynki, setSkrzynki] = useState<Array<{ email: string; quotaMb: number | null }> | null>(null);
  const [bladListy, setBladListy] = useState<string | null>(null);
  const [cel, setCel] = useState('');
  const [testCelu, setTestCelu] = useState<Wynik>(null);

  const [zgoda, setZgoda] = useState(false);
  const [startuje, setStartuje] = useState(false);
  const [komunikat, setKomunikat] = useState<Wynik>(null);

  useEffect(() => {
    void fetchHostingEmailAction(serviceId).then((w) => {
      if (!w.ok) return setBladListy(w.blad);
      if (w.dane.fetchError) setBladListy(w.dane.fetchError);
      setSkrzynki(w.dane.rows.map((r) => ({ email: r.email, quotaMb: r.quotaMb })));
    });
  }, [serviceId]);

  const zrodlo = () => ({ host: host.trim(), port, username: login.trim(), password: haslo, email: cel || undefined });

  // Każda zmiana danych unieważnia wynik testu — start tylko po teście tych danych, które idą do migracji.
  const zmienZrodlo = (f: () => void) => {
    f();
    setTestZrodla(null);
  };

  async function sprawdzZrodlo() {
    setTestujeZrodlo(true);
    setTestZrodla(null);
    const res = await preflightMigrationAction({ serviceId, imap: [zrodlo()] });
    setTestujeZrodlo(false);
    if ('error' in res) return setTestZrodla({ ok: false, tekst: res.error });
    const c: PreflightCheckResult | undefined = (res.result as PreflightSummary).checks.find((x) => x.kind === 'imap');
    if (!c) return setTestZrodla({ ok: false, tekst: 'Serwer nie zwrócił wyniku testu — spróbuj ponownie.' });
    setTestZrodla({ ok: c.status === 'ok', tekst: c.message });
  }

  function sprawdzCel() {
    const s = skrzynki?.find((x) => x.email === cel);
    if (!s) return setTestCelu({ ok: false, tekst: 'Tej skrzynki nie ma na koncie — załóż ją w zakładce Poczta.' });
    if (host.trim().toLowerCase() && login.trim().toLowerCase() === cel.toLowerCase() && /verris/i.test(host)) {
      return setTestCelu({ ok: false, tekst: 'To ta sama skrzynka co źródło — wybierz inną.' });
    }
    setTestCelu({
      ok: true,
      tekst: `Skrzynka ${s.email} jest na tym koncie${s.quotaMb ? `, limit ${s.quotaMb} MB` : ''}. Wiadomości dopiszemy obok istniejących.`,
    });
  }

  async function start() {
    setStartuje(true);
    setKomunikat(null);
    const res = await createMigrationBundleAction({ serviceId, imap: [zrodlo()], consentAccepted: true });
    setStartuje(false);
    if ('error' in res) return setKomunikat({ ok: false, tekst: res.error });
    setKomunikat({ ok: true, tekst: 'Przenoszenie poczty ruszyło — postęp zobaczysz poniżej.' });
    setHaslo('');
    setTestZrodla(null);
    onQueued?.();
  }

  const gotowe = testZrodla?.ok === true && testCelu?.ok === true && zgoda && !startuje;

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white">1. Skąd przenosimy — stara skrzynka</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className={labelText}>Serwer IMAP</span>
            <input className={input} placeholder="np. imap.stary-hosting.pl" value={host} onChange={(e) => zmienZrodlo(() => setHost(e.target.value))} />
          </label>
          <label className="space-y-1">
            <span className={labelText}>Port (993 = SSL)</span>
            <input className={input} type="number" min={1} max={65535} value={port} onChange={(e) => zmienZrodlo(() => setPort(Number(e.target.value) || 993))} />
          </label>
          <label className="space-y-1">
            <span className={labelText}>Login (zwykle adres skrzynki)</span>
            <input className={input} autoComplete="off" placeholder="biuro@stara-domena.pl" value={login} onChange={(e) => zmienZrodlo(() => setLogin(e.target.value))} />
          </label>
          <label className="space-y-1">
            <span className={labelText}>Hasło</span>
            <input className={input} type="password" autoComplete="new-password" value={haslo} onChange={(e) => zmienZrodlo(() => setHaslo(e.target.value))} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={testujeZrodlo || !host.trim() || !login.trim() || !haslo} onClick={sprawdzZrodlo} className="bg-white/10 text-white hover:bg-white/20">
            {testujeZrodlo ? 'Sprawdzam…' : 'Sprawdź dane'}
          </Button>
          <WynikTestu w={testZrodla} />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white">2. Dokąd przenosimy — skrzynka na tym koncie</h3>
        {bladListy ? <p className="text-xs text-rose-300">{bladListy}</p> : null}
        {skrzynki && skrzynki.length === 0 ? (
          <p className="text-xs text-neutral-400">Na koncie nie ma jeszcze skrzynek — załóż ją w zakładce Poczta, potem wróć tutaj.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[16rem] flex-1 md:max-w-md">
              <Select
                value={cel}
                onChange={(v) => {
                  setCel(v);
                  setTestCelu(null);
                  setTestZrodla(null);
                }}
                options={[{ value: '', label: skrzynki ? 'Wybierz skrzynkę' : 'Wczytuję skrzynki…' }, ...(skrzynki ?? []).map((s) => ({ value: s.email, label: s.email }))]}
                aria-label="Skrzynka docelowa"
              />
            </div>
            <Button type="button" disabled={!cel} onClick={sprawdzCel} className="bg-white/10 text-white hover:bg-white/20">
              Sprawdź skrzynkę
            </Button>
            <WynikTestu w={testCelu} />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white">3. Przeniesienie</h3>
        <label className="flex items-start gap-2 text-xs text-neutral-300">
          <Checkbox checked={zgoda} onChange={(e) => setZgoda(e.target.checked)} className="mt-0.5" />
          Zgadzam się na skopiowanie wiadomości i folderów ze starej skrzynki. Stara skrzynka zostaje bez zmian, hasło usuwamy po zakończeniu.
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={!gotowe} onClick={start} className="bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-40">
            {startuje ? 'Uruchamiam…' : 'Przenieś pocztę'}
          </Button>
          {!gotowe && !startuje ? <span className="text-xs text-neutral-500">Najpierw oba sprawdzenia na zielono i zgoda.</span> : null}
        </div>
        <WynikTestu w={komunikat} />
      </section>
    </div>
  );
}

function WynikTestu({ w }: { w: Wynik }) {
  if (!w) return null;
  return (
    <span role="status" className={`text-xs ${w.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
      {w.ok ? '✓ ' : '✗ '}
      {w.tekst}
    </span>
  );
}
