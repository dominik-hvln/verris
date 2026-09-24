'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { SectionHead, StatusPill, Switch } from '@/components/panel/v2';
import { potwierdz } from '@/components/panel/potwierdz';
import { createWebhook, deleteWebhook, fetchWebhooks, testWebhook, type WebhooksStan } from './webhooks-actions';

const INPUT = 'w-full rounded-[7px] border border-line bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-data';
const BTN = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50';
const OPIS: Record<string, string> = {
  'task.completed': 'Zadanie na stronie zakończone (np. aktualizacja WordPressa, wdrożenie z Gita, eksport bazy)',
  'task.failed': 'Zadanie na stronie nie powiodło się',
  'invoice.issued': 'Wystawiliśmy fakturę (numer, kwota)',
  'subscription.renewed': 'Usługa odnowiona na kolejny okres',
  'subscription.past_due': 'Odnowienie nie powiodło się — usługa czeka na płatność',
  ping: 'Test',
};
const STATUS = { SENT: 'dostarczone', PENDING: 'w kolejce', FAILED: 'nie dostarczone' } as const;

/**
 * L-10 — webhooki: Verris wysyła POST z JSON-em na Twój adres, gdy coś się wydarzy na koncie.
 * Nagłówek x-verris-signature = HMAC-SHA256(sekret, treść) — sekret widać tylko raz, przy dodaniu.
 */
export function WebhooksClient() {
  const [stan, setStan] = useState<WebhooksStan | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [wybrane, setWybrane] = useState<string[]>(['task.completed', 'task.failed']);
  const [sekret, setSekret] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const odswiez = useCallback(
    () =>
      fetchWebhooks().then((r) => {
        if (r.ok) {
          setStan(r.data);
          setBlad(null);
        } else setBlad(r.error);
      }),
    [],
  );
  useEffect(() => {
    void odswiez();
  }, [odswiez]);

  const dodaj = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await createWebhook(url.trim(), wybrane);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setSekret(r.data.sekret);
      setUrl('');
      await odswiez();
    });
  };
  const usun = async (id: string, u: string) => {
    if (!(await potwierdz(`Usunąć webhook ${u}? Zdarzenia przestaną tam trafiać.`, { akcja: 'Usuń', niebezpieczne: true }))) return;
    start(async () => {
      const r = await deleteWebhook(id);
      if (r.ok) await odswiez();
      else toast.error(r.error);
    });
  };
  const testuj = (id: string) =>
    start(async () => {
      const r = await testWebhook(id);
      if (r.ok) {
        toast.success('Test w kolejce — wynik pojawi się w ciągu minuty.');
        setTimeout(() => void odswiez(), 65_000);
      } else toast.error(r.error);
    });
  const przelacz = (z: string, on: boolean) => setWybrane((w) => (on ? [...new Set([...w, z])] : w.filter((x) => x !== z)));

  return (
    <section>
      <SectionHead
        title="Webhooki"
        desc="Verris wyśle POST z JSON-em na Twój adres, gdy coś się wydarzy na koncie. Każde wywołanie ma nagłówek x-verris-signature: HMAC-SHA256 treści z Twoim sekretem."
      />
      <div className="rounded-[10px] border border-line bg-card">
        {blad ? <p role="alert" className="m-0 border-b border-line px-4 py-2 text-[13px] text-crit">Nie udało się wczytać: {blad}</p> : null}
        {sekret ? (
          <div className="border-b border-line bg-warn-soft px-4 py-3 text-[13px] text-foreground">
            <b>Sekret webhooka — skopiuj go teraz, później już go nie pokażemy:</b>
            <code className="mt-1 block break-all font-mono text-[12.5px]">{sekret}</code>
            <button type="button" className="mt-2 text-[12px] underline" onClick={() => setSekret(null)}>
              Zapisałem, ukryj
            </button>
          </div>
        ) : null}
        <form onSubmit={dodaj} className="grid gap-3 px-4 py-3">
          <label className="block text-[13px] font-medium text-foreground">
            Adres (https://)
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://twoja-aplikacja.pl/verris-webhook" maxLength={500} className={`mt-1 ${INPUT} font-mono`} />
          </label>
          <div className="grid gap-2">
            {(stan?.zdarzenia ?? ['task.completed', 'task.failed']).map((z) => (
              <div key={z} className="flex items-center gap-2 text-[13px] text-foreground">
                <Switch checked={wybrane.includes(z)} onChange={(v) => przelacz(z, v)} label={z} disabled={pending} />
                <span className="font-mono text-[12px]">{z}</span>
                <span className="text-muted-foreground">— {OPIS[z] ?? ''}</span>
              </div>
            ))}
          </div>
          <div>
            <button type="submit" disabled={pending || !url.trim() || !wybrane.length} className={BTN}>
              Dodaj webhook
            </button>
          </div>
        </form>
        {stan?.adresy.length ? (
          <ul className="m-0 list-none border-t border-line p-0 text-[13px]">
            {stan.adresy.map((a) => (
              <li key={a.id} className="border-t border-line px-4 py-3 first:border-t-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="break-all font-mono text-foreground">{a.url}</span>
                    <span className="ml-2 text-[12px] text-muted-foreground">{a.zdarzenia.join(', ')}</span>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => testuj(a.id)} disabled={pending} className={BTN}>
                      Wyślij test
                    </button>
                    <button type="button" onClick={() => void usun(a.id, a.url)} disabled={pending} className={BTN}>
                      Usuń
                    </button>
                  </div>
                </div>
                {a.dostawy.length ? (
                  <ul className="m-0 mt-2 list-none p-0 text-[12px]">
                    {a.dostawy.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center gap-2 py-0.5 text-muted-foreground">
                        <StatusPill tone={d.status === 'SENT' ? 'data' : d.status === 'FAILED' ? 'warn' : 'muted'}>{STATUS[d.status]}</StatusPill>
                        <span className="font-mono">{d.zdarzenie}</span>
                        <span>{new Date(d.utworzona).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        {d.kod ? <span>HTTP {d.kod}</span> : null}
                        {d.blad ? <span className="text-crit">{d.blad}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 mt-1 text-[12px] text-muted-foreground">Jeszcze nic nie wysłaliśmy.</p>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
