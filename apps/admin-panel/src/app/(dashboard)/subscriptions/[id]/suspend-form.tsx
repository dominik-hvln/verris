'use client';

import { Select } from '@/components/select';
import { useState, useId } from 'react';
import { suspendSubscriptionAction, unsuspendSubscriptionAction, zakonczIUsunAction } from './suspend-actions';
import { potwierdz, zapytaj } from "@/components/potwierdz";
import { Checkbox } from '@/components/checkbox';

const REASONS = [
  { value: 'ABUSE', label: 'Nadużycie (spam, malware, phishing)' },
  { value: 'MANUAL_ADMIN', label: 'Decyzja operatora' },
  { value: 'CUSTOMER_REQUEST', label: 'Na prośbę klienta' },
  { value: 'PAYMENT_FAILED', label: 'Brak płatności' },
];

/**
 * A-25/A-26 — zatrzymanie szkody bez curla: zawieszenie wyłącza stronę, pocztę
 * i FTP konta; odwieszenie przywraca je. Oba kroki są w audycie i z potwierdzeniem.
 */
export function SuspendForm({ subscriptionId, status, domain }: { subscriptionId: string; status: string; domain: string | null }) {
  const reasonId = useId();
  const suspended = status === 'SUSPENDED';
  const terminal = status === 'CANCELED' || status === 'EXPIRED';
  const [reason, setReason] = useState(REASONS[0].value);
  const [note, setNote] = useState('');
  const [charge, setCharge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  if (terminal) return <p className="text-sm text-muted-foreground">Usługa jest {status === 'CANCELED' ? 'anulowana' : 'wygasła'} — nie ma czego zawieszać.</p>;

  const submit = async () => {
    const what = domain ?? subscriptionId.slice(0, 8);
    const question = suspended
      ? `Odwiesić usługę ${what}?${charge ? ' Klient zostanie obciążony za odnowienie.' : ''}`
      : `Zawiesić usługę ${what}? Strona, poczta i FTP przestaną działać do odwieszenia.`;
    if (!(await potwierdz(question, { akcja: 'Zatwierdź' }))) return;
    setBusy(true);
    setMsg(null);
    const res = suspended
      ? await unsuspendSubscriptionAction(subscriptionId, note, charge)
      : await suspendSubscriptionAction(subscriptionId, reason, note);
    setBusy(false);
    if ('error' in res) setMsg({ type: 'err', text: res.error });
    else {
      setMsg({ type: 'ok', text: suspended ? 'Usługa odwieszona.' : 'Usługa zawieszona.' });
      setNote('');
    }
  };

  return (
    <div className="space-y-3">
      {!suspended ? (
        // Etykieta obok, nie owijająca — klik w listę nie może ponownie aktywować przycisku.
        <div className="block space-y-1">
          <label htmlFor={reasonId} className="text-xs text-neutral-400">Powód</label>
          <Select
            id={reasonId}
            value={reason}
            onChange={setReason}
            disabled={busy}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            options={REASONS.map((r) => ({ value: r.value, label: r.label }))}
          />
        </div>
      ) : (
        <label className="flex items-center gap-2 text-sm text-neutral-200">
          <Checkbox checked={charge} onChange={(e) => setCharge(e.target.checked)} disabled={busy} />
          Obciąż klienta za odnowienie okresu przy odwieszeniu
        </label>
      )}
      <label className="block space-y-1">
        <span className="text-xs text-neutral-400">Notatka do audytu (opcjonalnie)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          disabled={busy}
          placeholder={suspended ? 'np. klient usunął złośliwe pliki' : 'np. zgłoszenie phishingu #1234'}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
        />
      </label>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
          suspended ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-rose-600 text-white hover:bg-rose-500'
        }`}
      >
        {busy ? 'Chwila…' : suspended ? 'Odwieś usługę' : 'Zawieś usługę'}
      </button>
      {msg ? <p className={`text-sm ${msg.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</p> : null}
    </div>
  );
}

/**
 * Zakończenie usługi i natychmiastowe usunięcie konta (bez 14 dni retencji). Nieodwracalne:
 * powód trafia do audytu, a operację potwierdza się wpisaniem domeny konta.
 */
export function ZakonczIUsunForm({ subscriptionId, confirmText, hasAccount }: { subscriptionId: string; confirmText: string; hasAccount: boolean }) {
  const [powod, setPowod] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const submit = async () => {
    const wpisane = await zapytaj(
      hasAccount
        ? `Usługa zostanie zakończona, a konto hostingowe ${confirmText} usunięte od razu — pliki, bazy i poczta. Tego nie da się cofnąć. Wpisz domenę, aby potwierdzić:`
        : `Usługa ${confirmText} zostanie zakończona od razu. Wpisz ${confirmText}, aby potwierdzić:`,
      { akcja: 'Zakończ i usuń', tytul: 'Operacja nieodwracalna', placeholder: confirmText },
    );
    if (wpisane === null) return;
    if (wpisane.trim().toLowerCase() !== confirmText.toLowerCase()) {
      setMsg({ type: 'err', text: 'Wpisany tekst nie zgadza się — nic nie zmieniono.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await zakonczIUsunAction(subscriptionId, powod, wpisane);
    setBusy(false);
    if ('error' in res) setMsg({ type: 'err', text: res.error });
    else {
      setMsg({ type: 'ok', text: hasAccount ? 'Usługa zakończona, konto usunięte.' : 'Usługa zakończona.' });
      setPowod('');
    }
  };

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs text-neutral-400">Powód (obowiązkowy, trafia do audytu)</span>
        <input
          value={powod}
          onChange={(e) => setPowod(e.target.value)}
          maxLength={500}
          disabled={busy}
          placeholder="np. prośba klienta w zgłoszeniu #1234"
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
        />
      </label>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || powod.trim().length < 3}
        className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
      >
        {busy ? 'Chwila…' : hasAccount ? 'Zakończ usługę i usuń konto' : 'Zakończ usługę'}
      </button>
      {msg ? <p className={`text-sm ${msg.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</p> : null}
    </div>
  );
}
