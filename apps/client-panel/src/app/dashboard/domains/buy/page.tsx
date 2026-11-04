import { DomainPurchaseWizard } from '../components/domain-purchase-wizard';
import { fetchRegistrarOrders, fetchRegistrarStatus } from '../actions';
import { tylkoProbneUslugi, uslugaWProbie, type ServiceSummaryDto } from '@verris/contracts/klient';
import { listServices } from '../../services/data';
import { OgraniczenieProby } from '@/components/panel/ograniczenie-proby';

/** 1.11 — w trwającej próbie bez płatnej usługi API odrzuca rejestrację i transfer domeny; mówimy to od razu. */
const KOMUNIKAT_DOMENY_W_PROBIE =
  'W czasie okresu próbnego nie zarejestrujesz ani nie przeniesiesz domeny. Opłać hosting, a zakup domeny odblokuje się od razu.';

/** Nazwa z wyszukiwarki na verris.pl (`?domain=`) — tylko litery, cyfry, myślnik i kropka. */
function nazwaZAdresu(v: string | string[] | undefined): string {
  const s = (Array.isArray(v) ? v[0] : v ?? '').trim().toLowerCase();
  return s.replace(/[^a-z0-9.-]/g, '').slice(0, 63);
}

export default async function BuyDomainPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { domain } = await searchParams;
  const status: { configured: boolean; nameservers?: string[] } = await fetchRegistrarStatus().catch(() => ({ provider: null, configured: false }));
  if (!status.configured) {
    return (
      <div className="mx-auto max-w-3xl rounded-[28px] border border-white/10 bg-[#0a0a0a] p-8">
        <h1 className="text-3xl font-bold text-white">Kup domenę</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          Zakup domen nie jest jeszcze dostępny w panelu. Skontaktuj się z supportem Verris.
        </p>
      </div>
    );
  }

  const uslugi: ServiceSummaryDto[] = await listServices().catch(() => []);
  if (tylkoProbneUslugi(uslugi)) {
    const proba = uslugi.find(uslugaWProbie);
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1 className="text-3xl font-bold text-white">Kup domenę</h1>
        <OgraniczenieProby tytul="Domeny po opłaceniu hostingu" tresc={KOMUNIKAT_DOMENY_W_PROBIE} uslugaProbnaId={proba?.id} />
      </div>
    );
  }

  const orders = await fetchRegistrarOrders().catch(() => []);
  return <DomainPurchaseWizard initialOrders={orders} initialLabel={nazwaZAdresu(domain)} domyslneNs={status.nameservers ?? []} />;
}
