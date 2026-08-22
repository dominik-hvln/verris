import Link from "next/link";
import { getFaktura, getKorekty } from "./data";
import { KorektaForm } from "./form";

export const dynamic = "force-dynamic";

const PLN = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function KorektaPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const [faktura, korekty] = await Promise.all([
    getFaktura(invoiceId),
    getKorekty(invoiceId).catch(() => []),
  ]);

  const juzKorekta = faktura.kind === "KOREKTA";

  return (
    <div className="space-y-6 p-6">
      <header>
        <Link href="/invoices" className="text-xs text-neutral-500 hover:text-white">
          ← Faktury
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          Korekta faktury {faktura.number}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          M-06 — pierwszy zwrot, pierwsza rezygnacja w trakcie okresu i pierwsza literówka w NIP-ie
          nie wypychają już operatora poza system. Korekta dostaje własną serię numeracji (VFK),
          ten sam PDF i tę samą ścieżkę do KSeF-a co faktura.
        </p>
      </header>

      {juzKorekta ? (
        <div className="rounded-md border border-amber-600/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          <b>To już jest korekta.</b> Nie koryguje się korekty — dokument odnosiłby się wtedy do
          dokumentu, który sam już coś zmienia, a wyliczenie „ile ostatecznie wyszło” przestaje być
          odczytem dwóch pól. Skoryguj fakturę pierwotną.
        </div>
      ) : (
        <>
          <section className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm">
            <dl className="grid gap-2 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-neutral-500">Kwota brutto</dt>
                <dd className="tabular-nums text-white">
                  {PLN.format(Number(faktura.amount))} {faktura.currency}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Data wystawienia</dt>
                <dd className="text-neutral-300">
                  {faktura.issuedAt ? faktura.issuedAt.slice(0, 10) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Status</dt>
                <dd className="text-neutral-300">{faktura.status}</dd>
              </div>
            </dl>
          </section>

          {korekty.length > 0 && (
            <section className="rounded-lg border border-white/10 p-4">
              <h2 className="mb-2 text-xs uppercase tracking-wide text-neutral-400">
                Wystawione już korekty
              </h2>
              <ul className="space-y-1 text-sm">
                {korekty.map((k) => (
                  <li key={k.id} className="flex flex-wrap gap-3 text-neutral-300">
                    <span className="font-mono text-xs">{k.number}</span>
                    <span className="text-xs text-neutral-500">{k.correctionKind}</span>
                    <span className="tabular-nums text-xs">
                      {PLN.format(Number(k.roznicaBrutto))} {k.currency}
                    </span>
                    <span className="text-xs text-neutral-500">{k.correctionReason}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-neutral-500">
                Kolejna korekta odnosi się do faktury pierwotnej, nie do poprzedniej korekty.
              </p>
            </section>
          )}

          <KorektaForm faktura={faktura} />
        </>
      )}
    </div>
  );
}
