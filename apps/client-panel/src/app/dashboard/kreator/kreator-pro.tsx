'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { cx } from '@/components/panel/cx';
import { potwierdz } from '@/components/panel/potwierdz';
import { UnpaidServiceBanner } from '@/components/hosting/UnpaidServiceBanner';
import { cancelSubscriptionAction } from '@/app/dashboard/services/subscription-payment-actions';
import { opisAbonamentuPro, oszczednoscRoczna, SKUTKI_KONCA_PRO, zl, type AbonamentKreatoraPro, type StanKreatoraPro } from '@/lib/kreator';
import { klasaPrzyciskuDrugiego, klasaPrzyciskuGlownego } from './wspolne';

/**
 * Paczka 121 – zakup i stan abonamentu Kreator Pro na karcie „Co daje Kreator Pro” (/dashboard/kreator).
 * Zakup idzie tym samym zamówieniem co inne usługi (POST /subscriptions; formularz z portfelem, BLIK/przelewem
 * i kartą na /dashboard/kreator/pro), anulowanie odnowienia – DELETE /subscriptions/:id { atPeriodEnd: true }.
 */
export function ZakupPro({ pro }: { pro: StanKreatoraPro }) {
  const [okres, setOkres] = useState<'MONTH' | 'YEAR'>('YEAR');
  const c = pro.cena;
  const oszczednosc = oszczednoscRoczna(c);
  const opcje = [
    { okres: 'MONTH' as const, tytul: 'Miesięcznie', brutto: c.miesiacBrutto, netto: c.miesiacNetto, jednostka: 'mies.', dopisek: null },
    {
      okres: 'YEAR' as const,
      tytul: 'Rocznie',
      brutto: c.rokBrutto,
      netto: c.rokNetto,
      jednostka: 'rok',
      dopisek: oszczednosc > 0 ? `Oszczędzasz ${zl(oszczednosc)} rocznie` : null,
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Okres abonamentu Kreator Pro" className="grid grid-cols-2 gap-2">
        {opcje.map((o) => {
          const wybrany = okres === o.okres;
          return (
            <button
              key={o.okres}
              type="button"
              role="radio"
              aria-checked={wybrany}
              onClick={() => setOkres(o.okres)}
              className={cx(
                'flex flex-col items-start gap-0.5 rounded-[8px] border px-3 py-2.5 text-left transition-colors',
                wybrany ? 'border-data bg-data-soft' : 'border-line bg-card hover:border-line-strong',
              )}
            >
              <span className="flex w-full items-center justify-between text-[12.5px] font-semibold text-foreground">
                {o.tytul}
                {wybrany ? <Check className="h-3.5 w-3.5 text-data-hi" aria-hidden /> : null}
              </span>
              <span className="font-display text-[17px] font-bold tabular-nums text-foreground">
                {zl(o.brutto)} <span className="text-[11.5px] font-normal text-muted-foreground">brutto/{o.jednostka}</span>
              </span>
              <span className="text-[11.5px] tabular-nums text-muted-foreground">{zl(o.netto)} netto</span>
              {o.dopisek ? <span className="text-[11.5px] font-semibold text-data-hi">{o.dopisek}</span> : null}
            </button>
          );
        })}
      </div>
      {pro.zakup.mozliwy ? (
        <Link href={`/dashboard/kreator/pro?okres=${okres}`} className={klasaPrzyciskuGlownego}>
          <Sparkles className="h-4 w-4" aria-hidden /> Kup Kreator Pro
        </Link>
      ) : (
        <>
          <button type="button" disabled className={klasaPrzyciskuGlownego} aria-describedby="kreator-pro-powod">
            <Sparkles className="h-4 w-4" aria-hidden /> Kup Kreator Pro
          </button>
          <p id="kreator-pro-powod" className="text-[12.5px] text-muted-foreground">
            {pro.zakup.powod}
          </p>
        </>
      )}
      <p className="text-[12px] text-muted-foreground">
        Płacisz z portfela, BLIK-iem, przelewem albo kartą. Faktura jak przy innych usługach, odnowienie anulujesz tutaj w każdej chwili.
      </p>
    </div>
  );
}

export function AbonamentPro({ abonament }: { abonament: AbonamentKreatoraPro }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [blad, setBlad] = useState<string | null>(null);
  const { naglowek, odnawianie } = opisAbonamentuPro(abonament);
  const moznaAnulowac = abonament.status === 'ACTIVE' && !abonament.bezOdnowienia && abonament.odnowienie !== 'reczne';

  const anuluj = async () => {
    const ok = await potwierdz(
      `Kreator Pro będzie działać do końca opłaconego okresu i nie odnowi się. ${SKUTKI_KONCA_PRO}`,
      { tytul: 'Anulować odnowienie Kreatora Pro?', akcja: 'Anuluj odnowienie' },
    );
    if (!ok) return;
    setBlad(null);
    startTransition(async () => {
      const wynik = await cancelSubscriptionAction(abonament.id, { atPeriodEnd: true });
      if (!wynik.ok) {
        setBlad(wynik.error);
        return;
      }
      router.refresh();
    });
  };

  if (abonament.status === 'PENDING_PAYMENT' || abonament.status === 'PAST_DUE') {
    return (
      <div className="flex flex-col gap-2">
        {abonament.status === 'PAST_DUE' ? <p className="text-[13px] font-semibold text-foreground">{naglowek}</p> : null}
        <UnpaidServiceBanner serviceId={abonament.id} status={abonament.status} paymentSource={abonament.odnowienie === 'karta' ? 'STRIPE_CARD' : 'WALLET'} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="font-display text-[16px] font-bold leading-tight text-foreground">{naglowek}</p>
      {odnawianie ? <p className="text-[13px] text-muted-foreground">{odnawianie}</p> : null}
      {abonament.bezOdnowienia || abonament.status === 'SUSPENDED' ? (
        <p className="rounded-[8px] bg-raised px-3 py-2 text-[12.5px] text-muted-foreground">{SKUTKI_KONCA_PRO}</p>
      ) : null}
      {blad ? (
        <p role="alert" className="text-[12.5px] text-crit">
          {blad}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {moznaAnulowac ? (
          <button type="button" onClick={() => void anuluj()} disabled={pending} className={klasaPrzyciskuDrugiego}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Anuluj odnowienie
          </button>
        ) : null}
        {abonament.status === 'SUSPENDED' ? (
          <Link href="/dashboard/billing" className={klasaPrzyciskuDrugiego}>
            Płatności
          </Link>
        ) : null}
      </div>
      {moznaAnulowac ? (
        <p className="text-[12px] text-muted-foreground">
          Zmiana okresu (miesiąc ↔ rok): anuluj odnowienie, a po końcu okresu kup abonament z nowym okresem.
        </p>
      ) : null}
    </div>
  );
}
