import Link from "next/link";
import { getCzekajace } from "./data";
import { DopiszNumerForm } from "./form";

export const dynamic = "force-dynamic";

const PLN = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * FAK-01 — kolejka dokumentów rozliczeniowych bez faktury VAT.
 *
 * Fakturę wystawia program księgowy; panel pamięta, za co jej jeszcze nie ma.
 * Najstarsze na górze — ustawowy termin wystawienia faktury biegnie od
 * sprzedaży (do 15. dnia następnego miesiąca).
 */
export default async function CzekaNaFakturePage() {
  const wiersze = await getCzekajace();

  return (
    <div className="space-y-6 p-6">
      <header>
        <Link href="/invoices" className="text-xs text-neutral-500 hover:text-white">
          ← Faktury
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Czeka na fakturę VAT</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Faktury VAT wystawiamy w programie księgowym. Panel wystawia dokument rozliczeniowy
          (seria VDR/VDK) — po wystawieniu faktury w programie wpisz tu jej numer. Klient zobaczy
          go przy dokumencie w swoim panelu.
        </p>
      </header>

      {wiersze.length === 0 ? (
        <div className="rounded-lg border border-emerald-600/30 bg-emerald-500/5 p-4 text-sm text-emerald-100">
          Wszystkie dokumenty rozliczeniowe mają przypisaną fakturę VAT.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-xs text-neutral-400">
              <tr>
                <th className="px-3 py-2">Data sprzedaży</th>
                <th className="px-3 py-2">Dokument</th>
                <th className="px-3 py-2">Klient</th>
                <th className="px-3 py-2 text-right">Netto</th>
                <th className="px-3 py-2 text-right">VAT</th>
                <th className="px-3 py-2 text-right">Brutto</th>
                <th className="px-3 py-2">Faktura VAT z programu</th>
              </tr>
            </thead>
            <tbody>
              {wiersze.map((w) => (
                <tr key={w.id} className="border-t border-white/5">
                  <td className="whitespace-nowrap px-3 py-2 text-neutral-300">
                    {(w.paidAt ?? w.issuedAt ?? "").slice(0, 10) || "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-white">
                    {w.number}
                    {w.kind === "KOREKTA" ? (
                      <span className="ml-2 text-xs text-amber-300">korekta</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/customers/${w.userId}`} className="text-indigo-300 hover:underline">
                      {w.userId.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {w.netAmount ? PLN.format(Number(w.netAmount)) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {w.vatAmount ? PLN.format(Number(w.vatAmount)) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-white">
                    {PLN.format(Number(w.amount))} {w.currency}
                  </td>
                  <td className="px-3 py-2">
                    <DopiszNumerForm invoiceId={w.id} dokument={w.number} />
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
