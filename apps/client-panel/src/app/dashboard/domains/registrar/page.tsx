import { Globe2, RefreshCw } from 'lucide-react';
import { fetchRegistrarOrders, registerDomainAction, transferDomainAction } from '../actions';

export default async function RegistrarPage() {
  const orders = await fetchRegistrarOrders().catch(() => []);
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Rejestrator domen</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Rejestracja, transfer i odnowienia domen działają przez skonfigurowanego providera rejestratora. Gdy provider nie jest skonfigurowany, API zwróci błąd zamiast symulować zakup.
        </p>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <form action={registerDomainAction} className="rounded-[28px] border border-white/10 bg-[#0a0a0a] p-6">
          <div className="mb-5 flex items-center gap-3">
            <Globe2 className="h-5 w-5 text-white" />
            <h2 className="text-lg font-semibold text-white">Zarejestruj domenę</h2>
          </div>
          <div className="space-y-4">
            <input name="name" required placeholder="twojadomena.pl" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white" />
            <input name="years" type="number" min={1} max={10} defaultValue={1} className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white" />
            <input name="nameservers" placeholder="ns1.verris.pl, ns2.verris.pl" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white" />
            <button className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black">Zamów rejestrację</button>
          </div>
        </form>

        <form action={transferDomainAction} className="rounded-[28px] border border-white/10 bg-[#0a0a0a] p-6">
          <div className="mb-5 flex items-center gap-3">
            <RefreshCw className="h-5 w-5 text-white" />
            <h2 className="text-lg font-semibold text-white">Transfer domeny</h2>
          </div>
          <div className="space-y-4">
            <input name="name" required placeholder="twojadomena.pl" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white" />
            <input name="authCode" required placeholder="Kod AuthInfo / EPP" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white" />
            <input name="years" type="number" min={1} max={10} defaultValue={1} className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white" />
            <input name="nameservers" placeholder="ns1.verris.pl, ns2.verris.pl" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white" />
            <button className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black">Zleć transfer</button>
          </div>
        </form>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-[#0a0a0a] p-6">
        <h2 className="mb-5 text-lg font-semibold text-white">Historia zleceń</h2>
        <div className="space-y-3">
          {orders.length === 0 ? (
            <p className="text-sm text-neutral-500">Brak zleceń rejestratora.</p>
          ) : orders.map((order) => (
            <div key={order.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-white">{order.domainName}</p>
                  <p className="text-xs text-neutral-500">{order.type} · provider: {order.provider ?? 'nieustawiony'}</p>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-neutral-300">{order.status}</span>
              </div>
              {order.lastError && <p className="mt-3 text-sm text-red-300">{order.lastError}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
