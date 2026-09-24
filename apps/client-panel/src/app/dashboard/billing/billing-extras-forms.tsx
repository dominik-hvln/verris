'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { SavedPaymentMethodDto, WalletAutoTopupSettingsDto } from '@verris/contracts';
import { toast } from 'sonner';
import { CreditCard, Landmark, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { CREDIT_SHORT, formatCredits, pluralCredits } from '@/lib/credits';
import { deletePaymentMethodAction, redeemPromoAction, startAddCardAction, upsertAutoTopupAction } from './actions';
import { Select } from '@/components/panel';
import { potwierdz } from '@/components/panel/potwierdz';

interface Props {
  initialAuto: WalletAutoTopupSettingsDto;
  savedCards: SavedPaymentMethodDto[];
}

export function BillingExtrasForms({ initialAuto, savedCards }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <PromoRedeemBlock />
      <SavedCardsBlock cards={savedCards} />
      <WalletAutotopupBlock initialAuto={initialAuto} savedCards={savedCards} />
    </div>
  );
}

const cardLabel = (c: SavedPaymentMethodDto) => `${(c.brand ?? 'Karta').toUpperCase()} •••• ${c.last4 ?? '····'}`;

/** M-26 — zapisane karty z możliwością usunięcia. */
function SavedCardsBlock({ cards }: { cards: SavedPaymentMethodDto[] }) {
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);

  const remove = async (c: SavedPaymentMethodDto) => {
    if (!(await potwierdz(`Usunąć kartę ${cardLabel(c)}? Nie obciążymy jej więcej — ani przy auto-doładowaniu, ani przy odnowieniu.`, { akcja: 'Usuń', niebezpieczne: true }))) return;
    setRemoving(c.id);
    const res = await deletePaymentMethodAction(c.id);
    setRemoving(null);
    if (!res.ok) {
      toast.error('Nie udało się usunąć karty', { description: res.error });
      return;
    }
    toast.success(`Karta ${cardLabel(c)} usunięta`);
    router.refresh();
  };

  const [adding, setAdding] = useState(false);
  const add = async () => {
    setAdding(true);
    const res = await startAddCardAction();
    if (!res.ok) {
      setAdding(false);
      toast.error('Nie udało się otworzyć formularza karty', { description: res.error });
      return;
    }
    window.location.href = res.url;
  };

  return (
    <section className="rounded-[10px] border border-line bg-card px-4 pb-3 pt-3.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 font-display text-[15px] font-bold text-foreground">Zapisane karty</h3>
        <button
          type="button"
          onClick={() => void add()}
          disabled={adding}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1 text-xs text-foreground hover:bg-raised disabled:opacity-50"
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
          Dodaj kartę
        </button>
      </div>
      {cards.length === 0 ? (
        <p className="m-0 mt-2 text-sm text-muted-foreground">
          Brak zapisanych kart. Dodaj kartę, żeby włączyć auto-doładowanie portfela — nic nie pobieramy przy dodaniu.
        </p>
      ) : null}
      <ul className="m-0 mt-2 list-none p-0">
        {cards.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5 first:border-0">
            <span className="inline-flex items-center gap-2 text-sm text-foreground">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              {cardLabel(c)}
              {c.expMonth && c.expYear ? (
                <span className="text-muted-foreground">
                  · ważna do {String(c.expMonth).padStart(2, '0')}/{String(c.expYear).slice(-2)}
                </span>
              ) : null}
              {c.isDefault ? <span className="text-muted-foreground">· domyślna</span> : null}
            </span>
            <button
              type="button"
              onClick={() => void remove(c)}
              disabled={removing === c.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1 text-xs text-foreground hover:bg-raised disabled:opacity-50"
            >
              {removing === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Usuń
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PromoRedeemBlock() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setDone(null);
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await redeemPromoAction(fd);
      if (res.ok) {
        setCode('');
        setDone(
          `Na portfel dopisaliśmy ${formatCredits(res.amountPln, { signed: true })} — kod „${res.code}” został zrealizowany.`,
        );
        router.refresh();
      } else {
        setError(res.error ?? 'Błąd.');
      }
    });
  };

  return (
    <section className="rounded-[10px] border border-line bg-card px-4 pb-4 pt-3.5">
      <div className="mb-3">
        <div>
          <h3 className="m-0 font-display text-[15px] font-bold text-foreground">Kod promocyjny</h3>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Wpisz kod od supportu lub z kampanii — kredyty trafią od razu na Twój portfel.
          </p>
        </div>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            name="code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Np. DEMO10"
            autoComplete="off"
            className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 uppercase tracking-wide font-mono text-sm text-white placeholder:text-neutral-600 focus:border-white/35 focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black hover:bg-neutral-200 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Zrealizuj
          </button>
        </div>
        {done ? (
          <p className="text-sm rounded-xl border border-emerald-400/25 bg-emerald-400/5 px-4 py-2 text-emerald-100">
            {done}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm rounded-xl border border-rose-400/25 bg-rose-400/5 px-4 py-2 text-rose-100">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function WalletAutotopupBlock({
  initialAuto,
  savedCards,
}: {
  initialAuto: WalletAutoTopupSettingsDto;
  savedCards: SavedPaymentMethodDto[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState(initialAuto);
  const [cardId, setCardId] = useState(initialAuto.paymentMethodId ?? '');

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await upsertAutoTopupAction(fd);
      if (res.ok) {
        setLocal(res.settings);
        router.refresh();
      } else {
        setError(res.error ?? 'Błąd.');
      }
    });
  };

  return (
    <section className="rounded-[10px] border border-line bg-card px-4 pb-4 pt-3.5">
      <div className="mb-3">
        <div className="min-w-0">
          <h3 className="m-0 font-display text-[15px] font-bold text-foreground">Auto-doładowanie</h3>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Gdy saldo spadnie poniżej progu, system pobierze zapisany sposób płatności (Stripe, off-session).
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={local.enabled}
            className="h-4 w-4 rounded border-white/20 bg-black/40 text-white focus:ring-white/30"
          />
          <span className="text-sm text-neutral-200">Włącz automatyczne doładowanie</span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
              Próg ({CREDIT_SHORT})
            </span>
            <input
              name="thresholdPln"
              type="text"
              inputMode="decimal"
              defaultValue={local.thresholdPln}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 text-white focus:border-white/35 focus:outline-none"
            />
            <span className="text-[10px] text-neutral-500">
              Gdy saldo spadnie poniżej tej liczby kredytów.
            </span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
              Kwota doładowania ({CREDIT_SHORT})
            </span>
            <input
              name="topupAmountPln"
              type="text"
              inputMode="decimal"
              defaultValue={local.topupAmountPln}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 text-white focus:border-white/35 focus:outline-none"
            />
            <span className="text-[10px] text-neutral-500">
              Stripe pobierze równowartość w PLN (1 zł = 1 kredyt).
            </span>
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide flex items-center gap-2">
            <Landmark className="h-3.5 w-3.5" />
            Karta
          </span>
          {/* hidden input utrzymuje pole `localPaymentMethodId` w FormData */}
          <input type="hidden" name="localPaymentMethodId" value={cardId} />
          <Select
            value={cardId}
            onChange={setCardId}
            aria-label="Karta do auto-doładowania"
            options={[
              {
                value: '',
                label: 'Automatycznie — pierwszy zapis na koncie lub domyślna przy Stripe Checkout',
              },
              ...savedCards.map((c) => ({
                value: c.id,
                label: `${(c.brand ?? 'Karta').toUpperCase()} •••• ${c.last4 ?? '····'}${
                  c.isDefault ? ' (domyślna)' : ''
                }`,
              })),
            ]}
          />
        </label>

        {savedCards.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nie masz zapisanej karty — auto-doładowanie użyje karty z Twojej ostatniej płatności kartą.
          </p>
        ) : null}

        {local.lastAttemptAt ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <RefreshCw className="h-3.5 w-3.5" />
            Ostatnia próba:{' '}
            {new Date(local.lastAttemptAt).toLocaleString('pl-PL')}{' '}
            {local.lastAttemptOk === true
              ? '— OK'
              : local.lastAttemptOk === false
                ? '— niepowodzenie'
                : ''}
            {local.lastAttemptError ? (
              <span className="text-rose-200/90 block w-full mt-1">{local.lastAttemptError}</span>
            ) : null}
            {local.cooldownUntil ? (
              <span className="text-neutral-400 block w-full">
                Cooldown do: {new Date(local.cooldownUntil).toLocaleString('pl-PL')}
              </span>
            ) : null}
          </div>
        ) : null}

        {local.totalToppedUpCount != null && local.totalToppedUpCount > 0 ? (
          <p className="text-xs text-neutral-500">
            Łącznie auto-doładowań: {local.totalToppedUpCount}
            {local.totalToppedUpAmountPln
              ? ` • suma ${formatCredits(local.totalToppedUpAmountPln)} (${pluralCredits(Number.parseFloat(local.totalToppedUpAmountPln) || 0)})`
              : ''}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Zapisz ustawienia
        </button>

        {error ? (
          <p className="text-sm rounded-xl border border-rose-400/25 bg-rose-400/5 px-4 py-2 text-rose-100">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
