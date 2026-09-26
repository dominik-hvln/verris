import Link from "next/link";
import { MailWarning } from "lucide-react";
import { listCordons } from "./actions";
import { ReleaseCordonButton } from "./release-button";

export const dynamic = "force-dynamic";

/**
 * N-14 — blokady wysyłki poczty (cordon). Mechanizm sam blokuje konto, które
 * przekroczy limity wysyłki (typowo przejęta skrzynka rozsyłająca spam); tu
 * operator widzi, kogo i dlaczego zablokowano, i zdejmuje blokadę.
 */
export default async function DeliverabilityPage() {
  const res = await listCordons();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-3 text-[28px] lg:text-[34px]">
          <MailWarning className="h-6 w-6 text-amber-300" /> Blokady wysyłki poczty
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Konto, które wysyła podejrzanie dużo poczty, jest automatycznie blokowane, żeby nie trafić adresu serwera na czarne listy.
          Zdejmij blokadę dopiero po usunięciu przyczyny (zmiana hasła skrzynki, usunięty skrypt).
        </p>
      </header>

      {!res.ok ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">Nie udało się pobrać blokad: {res.error}</p>
      ) : res.rows.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-black/30 px-4 py-8 text-center text-sm text-muted-foreground">Brak zablokowanych kont.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
          <table className="w-full text-sm">
            <thead className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Klient</th>
                <th className="px-4 py-3">Powód</th>
                <th className="px-4 py-3">Od</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {res.rows.map((c) => (
                <tr key={c.userId} className="border-b border-white/5 align-top last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${c.userId}`} className="font-medium text-white hover:text-cyan-300">
                      {c.name ?? c.email ?? c.userId}
                    </Link>
                    {c.email && c.name ? <div className="text-xs text-muted-foreground">{c.email}</div> : null}
                  </td>
                  <td className="px-4 py-3 text-neutral-200 [overflow-wrap:anywhere]">{c.reason}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{c.at ? new Date(c.at).toLocaleString("pl-PL") : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <ReleaseCordonButton userId={c.userId} label={c.email ?? c.userId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
