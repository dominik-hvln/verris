import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminApiError, adminApi } from "@/lib/api";
import type { Wniosek } from "@/lib/wnioski-actions";
import { plural } from "@/lib/pl";
import { DecyzjaWniosku, WycofajWniosek } from "./akcje-wniosku";

export const dynamic = "force-dynamic";

const STATUS_PL: Record<Wniosek["status"], string> = {
  PENDING: "Czeka na decyzję",
  APPROVED: "Zaakceptowany",
  REJECTED: "Odrzucony",
  CANCELLED: "Wycofany",
  FAILED: "Nie wykonano",
};
const STATUS_KOLOR: Record<Wniosek["status"], string> = {
  PENDING: "border-amber-400/40 text-amber-200",
  APPROVED: "border-emerald-500/40 text-emerald-200",
  REJECTED: "border-rose-500/40 text-rose-200",
  CANCELLED: "border-white/15 text-neutral-400",
  FAILED: "border-rose-500/40 text-rose-200",
};
const FILTRY: { klucz: string; nazwa: string }[] = [
  { klucz: "", nazwa: "Wszystkie" },
  { klucz: "APPROVED", nazwa: "Zaakceptowane" },
  { klucz: "REJECTED", nazwa: "Odrzucone" },
  { klucz: "FAILED", nazwa: "Nie wykonane" },
  { klucz: "CANCELLED", nazwa: "Wycofane" },
];

const wnioski = (n: number) => plural(n, "wniosek", "wnioski", "wniosków");
const data = (iso: string) => new Date(iso).toLocaleString("pl-PL");

async function lista(sciezka: string): Promise<{ wiersze: Wniosek[]; blad: string | null }> {
  try {
    return { wiersze: await adminApi<Wniosek[]>(sciezka), blad: null };
  } catch (e) {
    if (e instanceof AdminApiError && e.status === 401) redirect("/login");
    if (e instanceof AdminApiError && e.status === 403) {
      return { wiersze: [], blad: "Twoja rola nie ma uprawnienia „Akceptacja wniosków o operację” (REQUESTS_APPROVE)." };
    }
    return { wiersze: [], blad: "Nie udało się pobrać wniosków — spróbuj odświeżyć." };
  }
}

function Karta({ w, akcje }: { w: Wniosek; akcje?: React.ReactNode }) {
  return (
    <li className="space-y-2 px-4 py-4 text-sm" data-wniosek-id={w.id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-white">{w.etykieta}</p>
        <span className={`rounded border px-2 py-0.5 text-[11px] ${STATUS_KOLOR[w.status]}`}>{STATUS_PL[w.status]}</span>
      </div>
      <p className="text-neutral-200">{w.opis}</p>
      <p className="text-xs text-muted-foreground">
        {w.klient ? (
          <>
            Klient:{" "}
            <Link href={`/customers/${w.klient.id}`} className="text-cyan-300 hover:underline">
              {w.klient.nazwa ?? w.klient.email}
            </Link>{" "}
            ·{" "}
          </>
        ) : null}
        Wnioskuje: {w.wnioskujacy.nazwa ?? "—"} · {data(w.utworzono)}
      </p>
      <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-neutral-300">Uzasadnienie: {w.uzasadnienie}</p>
      {w.decydujacy ? (
        <p className="text-xs text-muted-foreground">
          Decyzja: {w.decydujacy.nazwa ?? "—"}
          {w.rozstrzygnieto ? ` · ${data(w.rozstrzygnieto)}` : ""}
          {w.powodDecyzji ? ` · powód: ${w.powodDecyzji}` : ""}
        </p>
      ) : null}
      {w.wynik?.komunikat ? <p className="text-xs text-emerald-300">{w.wynik.komunikat}</p> : null}
      {w.wynik?.blad ? <p className="text-xs text-rose-300">Nie wykonano: {w.wynik.blad}</p> : null}
      {akcje}
    </li>
  );
}

/**
 * PB-48 — wnioski pracowników o operację wymagającą wyższego uprawnienia: „Do decyzji” (akceptuj — operacja
 * wykonuje się z Twoim uprawnieniem; odrzuć z powodem) i „Historia” (rozpatrzone, filtr statusu).
 * Operator (STAFF) widzi też „Moje”.
 */
export default async function WnioskiPage({ searchParams }: { searchParams: Promise<{ zakladka?: string; status?: string }> }) {
  const { zakladka, status } = await searchParams;
  const dostep = await adminApi<{ isAdmin?: boolean }>("/staff/me/access").catch(() => null);
  const operator = dostep ? !dostep.isAdmin : false;
  const aktywna = zakladka === "historia" ? "historia" : zakladka === "moje" && operator ? "moje" : "do-decyzji";
  const filtr = FILTRY.some((f) => f.klucz === status) ? (status ?? "") : "";

  const biezaca =
    aktywna === "historia"
      ? await lista(`/admin/wnioski/historia${filtr ? `?status=${filtr}` : ""}`)
      : aktywna === "moje"
        ? await lista("/admin/wnioski/moje")
        : await lista("/admin/wnioski/do-decyzji");

  const zakladki = [
    { klucz: "do-decyzji", nazwa: "Do decyzji", href: "/wnioski" },
    { klucz: "historia", nazwa: "Historia", href: "/wnioski?zakladka=historia" },
    ...(operator ? [{ klucz: "moje", nazwa: "Moje", href: "/wnioski?zakladka=moje" }] : []),
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[28px] lg:text-[34px]">Wnioski o operacje</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pracownik bez uprawnienia zleca operację wnioskiem z uzasadnieniem. Akceptacja wykonuje ją z Twoim uprawnieniem —
          w dzienniku zapisują się obie osoby. Odrzucenie wymaga powodu (wnioskujący dostaje go w powiadomieniu).
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Zakładki wniosków">
        {zakladki.map((z) => (
          <Link
            key={z.klucz}
            href={z.href}
            aria-current={aktywna === z.klucz ? "page" : undefined}
            className={`rounded-lg border px-3 py-1.5 text-sm ${aktywna === z.klucz ? "border-cyan-500/40 bg-cyan-500/15 text-white" : "border-white/10 text-neutral-300"}`}
          >
            {z.nazwa}
          </Link>
        ))}
      </nav>

      {aktywna === "historia" ? (
        <nav className="flex flex-wrap gap-2" aria-label="Status">
          {FILTRY.map((f) => (
            <Link
              key={f.klucz || "wszystkie"}
              href={`/wnioski?zakladka=historia${f.klucz ? `&status=${f.klucz}` : ""}`}
              aria-current={filtr === f.klucz ? "true" : undefined}
              className={`rounded-full border px-2.5 py-1 text-xs ${filtr === f.klucz ? "border-cyan-500/40 text-white" : "border-white/10 text-neutral-400"}`}
            >
              {f.nazwa}
            </Link>
          ))}
        </nav>
      ) : null}

      {biezaca.blad ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{biezaca.blad}</p> : null}

      <section className="rounded-2xl border border-white/10 bg-black/30">
        <h2 className="border-b border-white/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white">
          {aktywna === "do-decyzji" ? "Czeka na decyzję" : aktywna === "moje" ? "Twoje wnioski" : "Historia"} — {wnioski(biezaca.wiersze.length)}
        </h2>
        {biezaca.wiersze.length === 0 && !biezaca.blad ? (
          <p className="p-6 text-sm text-muted-foreground">{aktywna === "do-decyzji" ? "Nic nie czeka na decyzję." : "Brak wniosków."}</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {biezaca.wiersze.map((w) => (
              <Karta
                key={w.id}
                w={w}
                akcje={aktywna === "do-decyzji" ? <DecyzjaWniosku id={w.id} /> : aktywna === "moje" && w.status === "PENDING" ? <WycofajWniosek id={w.id} /> : null}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
