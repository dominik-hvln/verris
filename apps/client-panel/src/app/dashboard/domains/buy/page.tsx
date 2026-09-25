import { DomainPurchaseWizard } from '../components/domain-purchase-wizard';
import { fetchRegistrarOrders, fetchRegistrarStatus } from '../actions';

/** Nazwa z wyszukiwarki na verris.pl (`?domain=`) — tylko litery, cyfry, myślnik i kropka. */
function nazwaZAdresu(v: string | string[] | undefined): string {
  const s = (Array.isArray(v) ? v[0] : v ?? '').trim().toLowerCase();
  return s.replace(/[^a-z0-9.-]/g, '').slice(0, 63);
}

export default async function BuyDomainPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { domain } = await searchParams;
  const status = await fetchRegistrarStatus().catch(() => ({ provider: null, configured: false }));
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

  const orders = await fetchRegistrarOrders().catch(() => []);
  return <DomainPurchaseWizard initialOrders={orders} initialLabel={nazwaZAdresu(domain)} />;
}
