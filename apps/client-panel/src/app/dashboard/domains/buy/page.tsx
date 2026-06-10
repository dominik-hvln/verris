import { DomainPurchaseWizard } from '../components/domain-purchase-wizard';
import { fetchRegistrarOrders, fetchRegistrarStatus } from '../actions';

export default async function BuyDomainPage() {
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
  return <DomainPurchaseWizard initialOrders={orders} />;
}
