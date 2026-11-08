import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { PlanDto } from '@verris/contracts/klient';
import { PageHeaderRow } from '@/components/panel';
import { listPublicPlans } from '@/app/dashboard/services/data';
import { NewSubscriptionForm } from '@/app/dashboard/services/new/form';
import { pobierzPartnera } from '@/app/dashboard/settings/partner-actions';
import { getWalletSummary } from '@/app/dashboard/billing/data';
import { planyZNarzutem } from '@/lib/narzut';
import { stanKreatora } from '../akcje';
import { klasaPrzyciskuDrugiego } from '../klasy';

export const dynamic = 'force-dynamic';

const OPIS = 'Abonament rozszerza Verris Kreator na całym koncie. Płacisz tak jak za inne usługi: z portfela, BLIK-iem, przelewem albo kartą.';

/**
 * Paczka 121 – zakup abonamentu Kreator Pro tym samym zamówieniem co inne usługi (formularz z /dashboard/services/new:
 * okres, portfel / BLIK i przelew / karta, kod rabatowy, informacje przedumowne i zgody → POST /subscriptions).
 * Kreator Pro to produkt aplikacyjny: bez domeny i opcji hostingu, aktywny od razu po płatności.
 */
export default async function KreatorProZakupPage({ searchParams }: { searchParams: Promise<{ okres?: string }> }) {
  const { okres } = await searchParams;
  const [stan, partner, paynowDostepny] = await Promise.all([
    stanKreatora(),
    pobierzPartnera(),
    getWalletSummary()
      .then((w) => w.paynowDostepny === true)
      .catch(() => false),
  ]);
  const narzutPct = partner?.narzutPct ?? 0;
  const plany: PlanDto[] = await listPublicPlans()
    .then((p) => planyZNarzutem(p.filter((x) => x.productKind === 'KREATOR_PRO'), narzutPct))
    .catch(() => []);
  const powod = !stan.ok
    ? 'Nie udało się wczytać kreatora – odśwież stronę za chwilę.'
    : !stan.dane.dostep
      ? stan.dane.powod
      : stan.dane.pro && !stan.dane.pro.zakup.mozliwy
        ? stan.dane.pro.zakup.powod
        : plany.length === 0
          ? 'Kreator Pro jest chwilowo niedostępny w sprzedaży – spróbuj później.'
          : null;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/kreator" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Kreator stron
      </Link>
      <PageHeaderRow title="Kup Kreator Pro" description={OPIS} />
      {powod ? (
        <section className="flex max-w-2xl flex-col items-start gap-3 rounded-[10px] border border-line bg-card px-5 py-5">
          <h2 className="m-0 font-display text-[16px] font-bold text-foreground">Teraz nie kupisz Kreatora Pro</h2>
          <p className="text-[13.5px] text-muted-foreground">{powod}</p>
          <Link href="/dashboard/kreator" className={klasaPrzyciskuDrugiego}>
            Wróć do kreatora
          </Link>
        </section>
      ) : (
        <div className="max-w-5xl">
          <NewSubscriptionForm
            plans={plany}
            initialInterval={okres === 'MONTH' ? 'MONTH' : 'YEAR'}
            bezKarty={narzutPct > 0}
            bezKodu={partner != null}
            paynowDostepny={paynowDostepny}
          />
        </div>
      )}
    </div>
  );
}
