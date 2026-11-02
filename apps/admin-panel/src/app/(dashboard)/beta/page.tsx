import { bramkaStrony } from "@/lib/bramka-strony";
import { AlertCircle, UserPlus } from "lucide-react";
import Link from "next/link";
import { listTesters, listZgloszenia, type ListaZgloszen, type StatusZgloszenia, type TesterRow } from "./actions";
import { DecyzjaZgloszenia } from "./zgloszenia";
import { ETYKIETY_STATUSU, bezpiecznyLink, opisZakresu, zrodloZgloszenia } from "./zgloszenia-opisy";
import { InviteForm } from "./invite-form";
import { RevokeButton } from "./revoke-button";
import { OdswiezanieNaZywo, WierszTestera } from "./postep-testera";

export const dynamic = "force-dynamic";

/** PB-26 — otwarte testy przed startem: zaproszenia i postęp testerów (docs/ops/BETA_TESTY.md). */
const STATUSY: StatusZgloszenia[] = ["NOWE", "NIEPOTWIERDZONE", "ZAPROSZONE", "ODRZUCONE"];
const data = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Warsaw" }) : "—";

export default async function BetaPage({ searchParams }: { searchParams?: Promise<{ zgloszenia?: string }> }) {
  const bramka = await bramkaStrony("/beta");
  if (bramka) return bramka;
  const sp = (await searchParams) ?? {};
  const filtr = STATUSY.includes(sp.zgloszenia as StatusZgloszenia) ? (sp.zgloszenia as StatusZgloszenia) : undefined;
  let rows: TesterRow[] = [];
  let error: string | null = null;
  let zgl: ListaZgloszen | null = null;
  let bladZgl: string | null = null;
  try {
    rows = await listTesters();
  } catch (err) {
    error = err instanceof Error ? err.message : "Nieznany błąd";
  }
  try {
    zgl = await listZgloszenia(filtr);
  } catch (err) {
    bladZgl = err instanceof Error ? err.message : "Nieznany błąd";
  }
  const uzyte = rows.filter((r) => r.stan === "UZYTY");
  const zUsluga = uzyte.filter((r) => r.aktywneUslugi > 0).length;
  const kroki = uzyte.reduce((a, r) => a + (r.postep?.zrobione ?? 0), 0);
  const krokiWszystkie = uzyte.reduce((a, r) => a + (r.postep?.wszystkie ?? 0), 0);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] lg:text-[34px]">Testy (beta)</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Zaproszenia do testów przed startem. Tester to osoba, która zrealizowała swój kod; jej zgłoszenia z tematem „Testy (beta)” mają w panelu obsługi znacznik Beta.
          Cel: co najmniej 80% testerów z działającą stroną bez pomocy wsparcia.
        </p>
      </header>

      <section className="space-y-4" aria-labelledby="zgloszenia-beta">
        <div>
          <h2 id="zgloszenia-beta" className="text-lg font-bold text-white">Zgłoszenia z verris.pl/beta</h2>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
            Osoby, które wypełniły formularz. „Zaproś” jest aktywne po potwierdzeniu adresu linkiem z maila i wysyła ten sam imienny kod co formularz niżej.
            Niepotwierdzone znikają po 7 dniach, nowe i odrzucone po 90.
          </p>
        </div>
        <nav className="flex flex-wrap gap-2 text-xs" aria-label="Filtr zgłoszeń">
          <Link href="/beta" className={`rounded-lg border px-2.5 py-1 ${!filtr ? "border-white/40 text-white" : "border-white/10 text-muted-foreground"}`}>
            Wszystkie ({zgl ? Object.values(zgl.liczby).reduce((a, n) => a + n, 0) : 0})
          </Link>
          {STATUSY.map((s) => (
            <Link
              key={s}
              href={`/beta?zgloszenia=${s}`}
              className={`rounded-lg border px-2.5 py-1 ${filtr === s ? "border-white/40 text-white" : "border-white/10 text-muted-foreground"}`}
            >
              {ETYKIETY_STATUSU[s]} ({zgl?.liczby[s] ?? 0})
            </Link>
          ))}
        </nav>
        {bladZgl ? (
          <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0" /> Nie udało się pobrać zgłoszeń: {bladZgl}
          </div>
        ) : !zgl?.zgloszenia.length ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-muted-foreground">Brak zgłoszeń{filtr ? " w tym stanie" : ""}.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30">
            <table className="w-full text-left text-sm text-white">
              <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Zgłoszenie</th>
                  <th className="px-4 py-3 font-medium">Osoba</th>
                  <th className="px-4 py-3 font-medium">Chce sprawdzić</th>
                  <th className="px-4 py-3 font-medium">Strona i hosting</th>
                  <th className="px-4 py-3 font-medium">Źródło</th>
                  <th className="px-4 py-3 font-medium">Stan</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {zgl.zgloszenia.map((z) => {
                  const link = bezpiecznyLink(z.strona);
                  return (
                    <tr key={z.id} className="align-top">
                      <td className="px-4 py-3 text-xs text-muted-foreground">{data(z.utworzone)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{z.imie}</div>
                        <div className="text-xs text-muted-foreground">{z.email}</div>
                        {z.uwagi ? <p className="mt-1 max-w-xs text-xs text-neutral-300">{z.uwagi}</p> : null}
                      </td>
                      <td className="px-4 py-3 text-xs">{opisZakresu(z.zakres)}</td>
                      <td className="px-4 py-3 text-xs">
                        {link ? (
                          <a href={link} target="_blank" rel="noopener noreferrer nofollow" className="text-emerald-200 underline">
                            {z.strona}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {z.obecnyHosting ? <div className="mt-1 text-muted-foreground">{z.obecnyHosting}</div> : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{zrodloZgloszenia(z)}</td>
                      <td className="px-4 py-3 text-xs">
                        <div>{ETYKIETY_STATUSU[z.status]}</div>
                        <div className="text-muted-foreground">{z.potwierdzone ? `potwierdzone ${data(z.potwierdzone)}` : "adres niepotwierdzony"}</div>
                        {z.kod ? <div className="mt-1 font-mono text-emerald-200">{z.kod}</div> : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DecyzjaZgloszenia z={z} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <InviteForm />

      <OdswiezanieNaZywo />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Zaproszenia", rows.length],
          ["Kody użyte", uzyte.length],
          ["Testerzy z aktywną usługą", uzyte.length ? `${zUsluga} (${Math.round((zUsluga / uzyte.length) * 100)}%)` : "0"],
          ["Kroki scenariuszy odhaczone", krokiWszystkie ? `${kroki} z ${krokiWszystkie} (${Math.round((kroki / krokiWszystkie) * 100)}%)` : "—"],
        ].map(([l, n]) => (
          <div key={String(l)} className="rounded-2xl border border-white/10 bg-[#0a0a0a] px-5 py-4">
            <div className="text-2xl font-bold text-white">{n}</div>
            <div className="mt-1 text-xs text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" /> Nie udało się pobrać listy: {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
          <UserPlus className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 text-base font-bold text-white">Nikt jeszcze nie został zaproszony</h3>
          <p className="mt-1 text-sm text-muted-foreground">Wyślij pierwsze zaproszenie formularzem powyżej.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30">
          <table className="w-full text-left text-sm text-white">
            <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Osoba</th>
                <th className="px-4 py-3 font-medium">Kod</th>
                <th className="px-4 py-3 font-medium">Stan</th>
                <th className="px-4 py-3 font-medium">Konto</th>
                <th className="px-4 py-3 font-medium">Postęp</th>
                <th className="px-4 py-3 font-medium">Usługi</th>
                <th className="px-4 py-3 font-medium">Zgłoszenia</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <WierszTestera key={r.id} r={r} akcja={r.stan === "CZEKA" ? <RevokeButton id={r.id} code={r.code} /> : null} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
