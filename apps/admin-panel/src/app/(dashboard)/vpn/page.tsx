import { fetchVpnOverview } from "./actions";
import { VpnManager } from "./vpn-manager";

export const dynamic = "force-dynamic";

export default async function VpnPage() {
  const { data, error } = await fetchVpnOverview();

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="text-3xl font-bold text-white">VPN — dostęp do paneli wewnętrznych</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
          WireGuard dla pracowników: panele <strong>admin</strong> i <strong>staff</strong> są
          osiągalne wyłącznie z subnetu VPN (restrykcja w Caddy). Tu generujesz konfigurację dla
          każdego urządzenia pracownika — klucz prywatny powstaje na serwerze, jest zwracany{" "}
          <strong>dokładnie raz</strong> i nigdy nie jest zapisywany. Cofnięcie dostępu działa do
          ~1 min (timer synchronizacji na hoście).
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Nie udało się pobrać stanu VPN: {error}
        </div>
      ) : (
        <VpnManager initial={data!} />
      )}
    </div>
  );
}
