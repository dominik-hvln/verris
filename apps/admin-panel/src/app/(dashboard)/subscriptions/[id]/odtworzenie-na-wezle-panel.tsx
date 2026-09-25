'use client';

import { useEffect, useState } from 'react';
import { Select } from '@/components/select';
import { potwierdz } from '@/components/potwierdz';
import { listaNaWezleAction, odtworzNaWezleAction, stanNaWezleAction, type StanNaWezle, type ZadanieNaWezle } from './odtworzenie-na-wezle-actions';

const STATUS: Record<string, string> = { QUEUED: 'w kolejce', RUNNING: 'w toku', COMPLETED: 'gotowe', FAILED: 'nieudane', CANCELLED: 'anulowane' };
const POLE = 'rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white';
const PRZYCISK = 'rounded-lg border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/5 disabled:opacity-50';
const rozmiar = (b: number | null) => (b === null ? '' : ` · ${(b / 1024 / 1024).toFixed(0)} MB`);

/**
 * H-16 — konto z utraconego (lub niedostępnego) węzła odtwarzane z kopii off-site na innym węźle.
 * Kolejność: wybierz węzeł docelowy → pokaż kopie → odtwórz. Konto przepina się na nowy węzeł
 * dopiero, gdy DirectAdmin je założy.
 */
type WynikNaWezle = Awaited<ReturnType<typeof stanNaWezleAction>>;

export function OdtworzenieNaWezlePanel({
  subscriptionId,
  domain,
  servers,
  currentServerId,
}: {
  subscriptionId: string;
  domain: string;
  servers: { id: string; name: string | null; region: string | null }[];
  currentServerId: string | null;
}) {
  const cele = servers.filter((s) => s.id !== currentServerId);
  const [stan, setStan] = useState<StanNaWezle | null>(null);
  const [cel, setCel] = useState(cele[0]?.id ?? '');
  const [wersja, setWersja] = useState('');
  const [archiwum, setArchiwum] = useState('');
  const [komunikat, setKomunikat] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [zajety, setZajety] = useState(false);

  const przyjmij = (r: WynikNaWezle) => {
    if (r.ok) {
      setStan(r.stan);
      setArchiwum((a) => a || r.stan.archiwa[0]?.name || '');
    } else setKomunikat({ ok: false, tekst: r.error });
  };
  const [odczyt, setOdczyt] = useState(0);
  useEffect(() => {
    let aktualny = true;
    void stanNaWezleAction(subscriptionId).then((r) => {
      if (!aktualny) return;
      if (!r.ok) return setKomunikat({ ok: false, tekst: r.error });
      setStan(r.stan);
      setArchiwum((a) => a || r.stan.archiwa[0]?.name || '');
    });
    return () => {
      aktualny = false;
    };
  }, [subscriptionId, odczyt]);
  useEffect(() => {
    if (!stan?.wToku) return;
    const t = setInterval(() => setOdczyt((n) => n + 1), 8000);
    return () => clearInterval(t);
  }, [stan?.wToku]);

  const pokazKopie = async () => {
    setZajety(true);
    setKomunikat(null);
    przyjmij(await listaNaWezleAction(subscriptionId, cel, wersja.trim()));
    setZajety(false);
  };

  const odtworz = async () => {
    const nazwa = cele.find((s) => s.id === cel)?.name ?? 'wybrany węzeł';
    if (
      !(await potwierdz(
        `Odtworzyć konto ${domain} z kopii ${archiwum} na węźle ${nazwa}? Po udanym odtworzeniu panel przepnie konto na ten węzeł. Przełącz DNS domen klienta, jeśli nie są na zewnętrznym DNS.`,
        { akcja: 'Odtwórz na węźle', niebezpieczne: true },
      ))
    )
      return;
    setZajety(true);
    setKomunikat(null);
    const r = await odtworzNaWezleAction(subscriptionId, cel, archiwum, wersja.trim());
    przyjmij(r);
    if (r.ok) setKomunikat({ ok: true, tekst: 'Zlecone. DirectAdmin zakłada konto — do 30 minut.' });
    setZajety(false);
  };

  const zadanie = (tytul: string, z: ZadanieNaWezle) =>
    z ? (
      <p className="text-xs text-neutral-300">
        {tytul}: <span className="text-white">{STATUS[z.status] ?? z.status}</span> · węzeł {z.wezel}
        {z.archiwum ? ` · ${z.archiwum}` : ''} · {new Date(z.utworzone).toLocaleString('pl-PL')}
        {z.blad ? <span className="block text-rose-300">{z.blad}</span> : null}
      </p>
    ) : null;

  if (!cele.length) return <p className="text-sm text-muted-foreground">Brak innego aktywnego węzła — odtworzenie na inny węzeł wymaga co najmniej dwóch.</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-400">
        Na wypadek awarii węzła: konto odtwarza się z kopii poza serwerem (prefiks{' '}
        <span className="font-mono">{stan?.wezelZrodlowy.prefiks ?? '—'}</span>) na innym węźle floty. Wymaga tych samych haseł rclone crypt na
        węzłach. DNS: przy zewnętrznym DNS przełącza się z kontem; przy DNS na węźle zmień serwery nazw domen klienta.
      </p>
      <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto] sm:items-end">
        <div className="space-y-1">
          <label htmlFor="h16-cel" className="text-xs text-neutral-300">Węzeł docelowy</label>
          <Select id="h16-cel" value={cel} onChange={setCel} options={cele.map((s) => ({ value: s.id, label: `${s.name ?? s.id}${s.region ? ` (${s.region})` : ''}` }))} />
        </div>
        <label className="space-y-1">
          <span className="text-xs text-neutral-300">Kopia z dnia (opcjonalnie)</span>
          <input value={wersja} onChange={(e) => setWersja(e.target.value)} placeholder="RRRRMMDD" maxLength={8} className={`w-full ${POLE} font-mono`} />
        </label>
        <button type="button" className={PRZYCISK} disabled={zajety || stan?.wToku || !cel} onClick={() => void pokazKopie()}>
          Pokaż kopie
        </button>
      </div>
      {zadanie('Lista kopii', stan?.lista ?? null)}
      {stan?.archiwa.length ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1">
            <label htmlFor="h16-archiwum" className="text-xs text-neutral-300">Kopia</label>
            <Select
              id="h16-archiwum"
              value={archiwum}
              onChange={setArchiwum}
              options={stan.archiwa.map((a) => ({ value: a.name, label: `${a.name}${a.modifiedAt ? ` · ${new Date(a.modifiedAt).toLocaleDateString('pl-PL')}` : ''}${rozmiar(a.sizeBytes)}` }))}
            />
          </div>
          <button type="button" className={`${PRZYCISK} border-rose-400/40 text-rose-200`} disabled={zajety || stan.wToku || !archiwum} onClick={() => void odtworz()}>
            Odtwórz na węźle
          </button>
        </div>
      ) : null}
      {zadanie('Odtworzenie', stan?.odtworzenie ?? null)}
      {komunikat ? <p role="status" className={`text-xs ${komunikat.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{komunikat.tekst}</p> : null}
    </div>
  );
}
