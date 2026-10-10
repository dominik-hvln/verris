'use client';

import { Select } from '@/components/select';
import { useState, useId } from 'react';
import { suspendSubscriptionAction, unsuspendSubscriptionAction, zakonczIUsunAction } from './suspend-actions';
import { potwierdz, zapytaj } from "@/components/potwierdz";
import { Checkbox } from '@/components/checkbox';
import { WyslijWniosek } from '@/components/wniosek-operacji';
import { brakUprawnienia, type DostepDoAkcji } from '@/lib/akcje/wezel';

const REASONS = [
  { value: 'ABUSE', label: 'Nadużycie (spam, malware, phishing)' },
  { value: 'MANUAL_ADMIN', label: 'Decyzja obsługi' },
  { value: 'CUSTOMER_REQUEST', label: 'Na prośbę klienta' },
  { value: 'PAYMENT_FAILED', label: 'Brak płatności', tylkoAdmin: true },
];

/** Powody do wyboru: pracownik bez „brak płatności” (mail o zaległości i wygaśnięcie — tylko administrator, jak API). */
export const powodyZawieszenia = (admin: boolean) => REASONS.filter((r) => admin || !r.tylkoAdmin);

const ADMIN: DostepDoAkcji = { isAdmin: true, permissions: [] };

/** Skutki zawieszenia — w potwierdzeniu i nad formularzem (F2.3: zawieszenie odcina też pocztę klienta). */
export const SKUTKI_ZAWIESZENIA = 'Strona, poczta (odbiór i wysyłka) i FTP klienta przestaną działać do odwieszenia.';

/**
 * A-25/A-26 — zatrzymanie szkody bez curla: zawieszenie wyłącza stronę, pocztę i FTP konta; odwieszenie
 * przywraca je. F2.3 (D2, 10.10): pracownik z SUBSCRIPTIONS_SUSPEND (L3) wykonuje sam z powodem i numerem
 * zgłoszenia; L2 (SUBSCRIPTIONS_MANAGE) wysyła wniosek; „brak płatności” i obciążenie za odnowienie zostają
 * dla administratora / BILLING_MANAGE (jak w API).
 */
export function SuspendForm({
  subscriptionId,
  userId,
  status,
  domain,
  dostep = ADMIN,
}: {
  subscriptionId: string;
  userId: string;
  status: string;
  domain: string | null;
  dostep?: DostepDoAkcji;
}) {
  const reasonId = useId();
  const suspended = status === 'SUSPENDED';
  const terminal = status === 'CANCELED' || status === 'EXPIRED';
  const admin = dostep.isAdmin;
  const bezUprawnienia = brakUprawnienia('SUBSCRIPTIONS_SUSPEND', dostep);
  const wniosek = !!bezUprawnienia && !brakUprawnienia('SUBSCRIPTIONS_MANAGE', dostep);
  const obciazy = !brakUprawnienia('BILLING_MANAGE', dostep);
  const powody = powodyZawieszenia(admin);
  const [reason, setReason] = useState(REASONS[0].value);
  const [note, setNote] = useState('');
  const [zgloszenie, setZgloszenie] = useState('');
  const [charge, setCharge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  if (terminal) return <p className="text-sm text-muted-foreground">Usługa jest {status === 'CANCELED' ? 'anulowana' : 'wygasła'} — nie ma czego zawieszać.</p>;

  const minPowodu = admin ? 0 : 10;
  const submit = async () => {
    const what = domain ?? subscriptionId.slice(0, 8);
    const question = suspended
      ? `Odwiesić usługę ${what}?${charge ? ' Klient zostanie obciążony za odnowienie.' : ''}`
      : `Zawiesić usługę ${what}? ${SKUTKI_ZAWIESZENIA} Klient zobaczy w aktywności konta wpis „obsługa Verris”.`;
    if (!(await potwierdz(question, { akcja: suspended ? 'Odwieś' : 'Zawieś', niebezpieczne: !suspended }))) return;
    setBusy(true);
    setMsg(null);
    const res = suspended
      ? await unsuspendSubscriptionAction(subscriptionId, note, charge && obciazy, zgloszenie)
      : await suspendSubscriptionAction(subscriptionId, reason, note, zgloszenie);
    setBusy(false);
    if ('error' in res) setMsg({ type: 'err', text: res.error });
    else {
      setMsg({ type: 'ok', text: suspended ? 'Usługa odwieszona.' : 'Usługa zawieszona.' });
      setNote('');
      setZgloszenie('');
    }
  };

  if (bezUprawnienia && !wniosek) {
    return <p className="text-sm text-muted-foreground" data-zawieszenie="brak-uprawnien">{bezUprawnienia}.</p>;
  }

  const poleZgloszenia = (
    <label className="block space-y-1">
      <span className="text-xs text-neutral-400">Numer zgłoszenia klienta (jeśli jest)</span>
      <input
        value={zgloszenie}
        onChange={(e) => setZgloszenie(e.target.value)}
        maxLength={64}
        disabled={busy}
        placeholder="#ab12cd34"
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white"
      />
    </label>
  );

  return (
    <div className="space-y-3">
      {!suspended ? <p className="text-xs text-amber-200" data-zawieszenie="skutki">{SKUTKI_ZAWIESZENIA}</p> : null}
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
            options={powody.map((r) => ({ value: r.value, label: r.label }))}
          />
        </div>
      ) : obciazy && !wniosek ? (
        <label className="flex items-center gap-2 text-sm text-neutral-200">
          <Checkbox checked={charge} onChange={(e) => setCharge(e.target.checked)} disabled={busy} />
          Obciąż klienta za odnowienie okresu przy odwieszeniu
        </label>
      ) : null}
      {poleZgloszenia}
      {wniosek ? (
        <WyslijWniosek
          typ={suspended ? 'SUBSCRIPTION_UNSUSPEND' : 'SUBSCRIPTION_SUSPEND'}
          userId={userId}
          subscriptionId={subscriptionId}
          payload={{
            subscriptionId,
            ...(suspended ? {} : { reason }),
            ...(zgloszenie.trim() ? { zgloszenie: zgloszenie.trim() } : {}),
          }}
          podpowiedz={`${bezUprawnienia}. Opisz powód w uzasadnieniu i wyślij wniosek — zdecyduje kierownik zmiany.`}
        />
      ) : (
        <>
          <label className="block space-y-1">
            <span className="text-xs text-neutral-400">{admin ? 'Powód do dziennika (opcjonalnie)' : 'Powód do dziennika (obowiązkowy, min. 10 znaków)'}</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              disabled={busy}
              placeholder={suspended ? 'np. klient usunął złośliwe pliki' : 'np. phishing potwierdzony, klient nie odpowiada'}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </label>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || note.trim().length < minPowodu}
            className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
              suspended ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-rose-600 text-white hover:bg-rose-500'
            }`}
          >
            {busy ? 'Chwila…' : suspended ? 'Odwieś usługę' : 'Zawieś usługę'}
          </button>
        </>
      )}
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
