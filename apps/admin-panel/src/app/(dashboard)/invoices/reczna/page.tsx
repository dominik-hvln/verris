import Link from "next/link";
import { FakturaRecznaForm } from "./form";

export const dynamic = "force-dynamic";

export default function FakturaRecznaPage() {
  return (
    <div className="space-y-6 p-6">
      <header>
        <Link href="/invoices" className="text-xs text-neutral-500 hover:text-white">
          ← Faktury
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Faktura wystawiana ręcznie</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Z-01 — dokument spoza automatu: ugoda, rekompensata, usługa spoza cennika. Ta sama
          numeracja VFV, ten sam PDF, ta sama ścieżka do KSeF-a co przy fakturach automatycznych.
          Bez tego każdy przypadek nietypowy wypycha operatora poza system, do Worda i własnej
          numeracji — a numeracja faktur ma być jedna i ciągła.
        </p>
      </header>

      <div className="rounded-md border border-amber-600/40 bg-amber-500/10 p-4 text-sm text-amber-100">
        <b>To jest dokument opłacony</b> — potwierdza rozliczoną transakcję i od razu dostaje
        status „zapłacona”. Faktura z terminem płatności (wezwanie do zapłaty) to inna funkcja
        i celowo jej tu nie ma: dodana po cichu, byłaby fakturą, której nikt nie pilnuje.
      </div>

      <FakturaRecznaForm />
    </div>
  );
}
