"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  Loader2,
  Lock,
  Plus,
  ShieldOff,
} from "lucide-react";
import { createVpnPeer, revokeVpnPeer, type VpnOverviewDto, type VpnPeerDto } from "./actions";

export function VpnManager({ initial }: { initial: VpnOverviewDto }) {
  const [peers, setPeers] = useState<VpnPeerDto[]>(initial.peers);
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [oneTimeConfig, setOneTimeConfig] = useState<{ name: string; config: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [revoking, setRevoking] = useState<string | null>(null);

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createVpnPeer({
        name: name.trim(),
        ownerEmail: ownerEmail.trim() || undefined,
      });
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setPeers((prev) => [result.data!.peer, ...prev]);
      setOneTimeConfig({ name: result.data!.peer.name, config: result.data!.clientConfig });
      setName("");
      setOwnerEmail("");
    });
  };

  const onRevoke = (id: string) => {
    setRevoking(id);
    startTransition(async () => {
      const result = await revokeVpnPeer(id);
      if ("data" in result && result.data) {
        setPeers((prev) => prev.map((p) => (p.id === id ? result.data! : p)));
      } else if ("error" in result && result.error) {
        setError(result.error);
      }
      setRevoking(null);
    });
  };

  const copyConfig = () => {
    if (!oneTimeConfig) return;
    void navigator.clipboard.writeText(oneTimeConfig.config).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const downloadConfig = () => {
    if (!oneTimeConfig) return;
    const blob = new Blob([oneTimeConfig.config], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `verris-vpn-${oneTimeConfig.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.conf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {!initial.configured && (
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            VPN nie jest jeszcze skonfigurowany na serwerze. Uruchom{" "}
            <code className="text-amber-200">ops/scripts/vpn-wireguard-setup.sh</code> na
            control-plane, wpisz <code className="text-amber-200">VPN_WG_SERVER_PUBLIC_KEY</code>,{" "}
            <code className="text-amber-200">VPN_WG_ENDPOINT</code> i{" "}
            <code className="text-amber-200">VPN_SYNC_TOKEN</code> do <code>.env.prod</code>,
            zrestartuj API i zainstaluj timer{" "}
            <code className="text-amber-200">vpn-sync-peers.sh --install</code>.
          </span>
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Lock className="h-4 w-4 text-indigo-300" /> Serwer VPN
        </h2>
        <div className="grid md:grid-cols-2 gap-2 text-sm text-zinc-300">
          <div>
            <span className="text-muted-foreground">Endpoint: </span>
            <code>{initial.endpoint ?? "—"}</code>
          </div>
          <div>
            <span className="text-muted-foreground">Subnet: </span>
            <code>{initial.subnet}</code>
          </div>
          <div className="md:col-span-2">
            <span className="text-muted-foreground">Klucz publiczny serwera: </span>
            <code className="break-all">{initial.serverPublicKey ?? "—"}</code>
          </div>
          <div className="md:col-span-2">
            <span className="text-muted-foreground">AllowedIPs klienta: </span>
            <code>{initial.clientAllowedIps}</code>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Plus className="h-4 w-4 text-indigo-300" /> Nowy dostęp (urządzenie pracownika)
        </h2>
        <form onSubmit={onCreate} className="grid md:grid-cols-3 gap-3">
          <input
            required
            minLength={3}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='Nazwa, np. "Anna — laptop"'
            className="vpn-input"
          />
          <input
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            placeholder="E-mail pracownika (opcjonalnie)"
            className="vpn-input"
          />
          <button
            type="submit"
            disabled={isPending || !initial.configured || name.trim().length < 3}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 px-4 py-2 text-sm font-medium"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Wygeneruj konfigurację
          </button>
        </form>
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}

        {oneTimeConfig && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-emerald-500/20 px-4 py-2.5">
              <span className="text-sm text-emerald-200 font-medium">
                Konfiguracja „{oneTimeConfig.name}" — widoczna TYLKO TERAZ (klucz prywatny nie jest
                zapisywany)
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={copyConfig}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/5"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Skopiowane" : "Kopiuj"}
                </button>
                <button
                  type="button"
                  onClick={downloadConfig}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/5"
                >
                  <Download className="h-3 w-3" /> Pobierz .conf
                </button>
              </span>
            </div>
            <pre className="p-4 text-[11px] leading-relaxed overflow-x-auto max-h-72 bg-black/70 text-zinc-300">
              <code>{oneTimeConfig.config}</code>
            </pre>
            <p className="px-4 pb-3 text-[11px] text-muted-foreground">
              Import: aplikacja WireGuard → „Add tunnel from file". Przekaż pracownikowi bezpiecznym
              kanałem (nie e-mailem). Peer będzie aktywny na serwerze do ~1 min.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 space-y-3">
        <h2 className="text-lg font-semibold">Urządzenia ({peers.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-white/10">
                <th className="py-2 pr-4">Nazwa</th>
                <th className="py-2 pr-4">Pracownik</th>
                <th className="py-2 pr-4">IP w VPN</th>
                <th className="py-2 pr-4">Klucz publiczny</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Utworzono</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {peers.map((p) => (
                <tr key={p.id} className="border-b border-white/5 text-zinc-300">
                  <td className="py-2 pr-4 font-medium text-white">{p.name}</td>
                  <td className="py-2 pr-4">{p.ownerEmail ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <code>{p.assignedIp}</code>
                  </td>
                  <td className="py-2 pr-4">
                    <code className="text-[11px]">{p.publicKey.slice(0, 16)}…</code>
                  </td>
                  <td className="py-2 pr-4">
                    {p.enabled ? (
                      <span className="text-emerald-300">aktywny</span>
                    ) : (
                      <span className="text-rose-300">
                        cofnięty{p.revokedAt ? ` (${new Date(p.revokedAt).toLocaleDateString("pl-PL")})` : ""}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-xs">
                    {new Date(p.createdAt).toLocaleString("pl-PL")}
                  </td>
                  <td className="py-2 text-right">
                    {p.enabled && (
                      <button
                        type="button"
                        onClick={() => onRevoke(p.id)}
                        disabled={revoking === p.id}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-rose-500/30 text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
                      >
                        {revoking === p.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <ShieldOff className="h-3 w-3" />
                        )}
                        Cofnij dostęp
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {peers.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground text-sm">
                    Brak skonfigurowanych urządzeń — wygeneruj pierwszą konfigurację powyżej.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <style>{`
        .vpn-input { width: 100%; border-radius: 0.5rem; background: rgb(255 255 255 / 0.05); border: 1px solid rgb(255 255 255 / 0.1); padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; }
        .vpn-input:focus { border-color: rgb(99 102 241 / 0.6); }
      `}</style>
    </div>
  );
}
