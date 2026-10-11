import { bramkaStrony } from "@/lib/bramka-strony";
import { adminApi } from "@/lib/api";
import { BladStrony } from "@/components/blad-strony";
import { Pomoc } from "@/components/pomoc";
import { Eyebrow, KARTA, Pigulka } from "@/components/v2";
import { plForm } from "@/lib/pl";
import { FormularzKomunikatu } from "./formularz-komunikatu";
import { ZatrzymajKomunikat } from "./zatrzymaj-button";
import type { Zakres } from "./actions";

export const dynamic = "force-dynamic";

type Komunikat = {
  id: string;
  zakres: Zakres;
  cel: { id: string | null; nazwa: string };
  temat: string;
  powod: string;
  status: "WYSYLANY" | "WYSLANY" | "ZATRZYMANY";
  odbiorcow: number;
  wyslano: number;
  bledow: number;
  pominieto: number;
  autor: string | null;
  utworzono: string;
};

const STATUS: Record<Komunikat["status"], { t: string; ton: "ok" | "warn" | "muted" }> = {
  WYSYLANY: { t: "wysyłany", ton: "warn" },
  WYSLANY: { t: "wysłany", ton: "ok" },
  ZATRZYMANY: { t: "zatrzymany", ton: "muted" },
};
const kiedy = (iso: string) => new Date(iso).toLocaleString("pl-PL");

/**
 * F3.8 (ON-01, ON-05) — komunikaty serwisowe do klientów węzła albo planu przy incydencie lub pracach (L4:
 * SERVICE_NOTICES_SEND, ADMIN). `?wezel=<id>` / `?plan=<id>` — zakres z karty węzła albo planu. Historia z postępem
 * kolejki i zatrzymaniem.
 */
export default async function KomunikatyPage({ searchParams }: { searchParams?: Promise<{ wezel?: string; plan?: string }> }) {
  const bramka = await bramkaStrony("/komunikaty");
  if (bramka) return bramka;
  const q = (await searchParams) ?? {};
  let lista: Komunikat[];
  try {
    lista = await adminApi<Komunikat[]>("/admin/komunikaty-serwisowe");
  } catch (e) {
    return <BladStrony blad={e} tytul="Komunikaty serwisowe" powrot={{ href: "/", label: "Pulpit" }} />;
  }
  // Listy celów: bez uprawnienia do węzłów albo planów — pusta lista (formularz powie, czego brakuje).
  const [wezly, plany] = await Promise.all([
    adminApi<{ id: string; name: string | null; hostname: string | null; ipAddress: string | null; status: string }[]>("/admin/servers").then(
      (r) => r.filter((s) => s.status === "ACTIVE" || s.status === "MAINTENANCE").map((s) => ({ id: s.id, nazwa: s.name ?? s.hostname ?? s.ipAddress ?? s.id })),
      () => [],
    ),
    adminApi<{ id: string; name: string; isActive?: boolean }[]>("/admin/plans").then((r) => r.map((p) => ({ id: p.id, nazwa: p.name })), () => []),
  ]);
  const start = q.plan ? { zakres: "PLAN" as const, celId: q.plan } : { zakres: "WEZEL" as const, celId: q.wezel ?? "" };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <Eyebrow>Klienci i usługi · Komunikacja</Eyebrow>
        <h1 className="flex items-center gap-2 text-[28px] lg:text-[34px]">
          Komunikaty serwisowe <Pomoc id="komunikaty-serwisowe" />
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Mail do wszystkich klientów węzła albo planu przy awarii lub pracach. To wiadomość serwisowa: wychodzi bez zgody marketingowej, więc bez treści promocyjnych.
        </p>
      </header>

      <FormularzKomunikatu wezly={wezly} plany={plany} start={start} />

      <section className={KARTA} aria-labelledby="historia-komunikatow">
        <h2 id="historia-komunikatow" className="px-4 pt-3.5 text-base font-semibold">
          Wysłane komunikaty
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Temat</th>
                <th className="px-4 py-2">Do kogo</th>
                <th className="px-4 py-2">Stan</th>
                <th className="px-4 py-2 text-right">Wysłane</th>
                <th className="px-4 py-2">Kto, kiedy</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {lista.map((k) => (
                <tr key={k.id} className="border-t border-line" data-komunikat={k.id}>
                  <td className="px-4 py-2">
                    <span className="font-semibold">{k.temat}</span>
                    <span className="block text-xs text-muted-foreground">{k.powod}</span>
                  </td>
                  <td className="px-4 py-2">
                    {k.zakres === "WEZEL" ? "węzeł" : "plan"} {k.cel.nazwa}
                  </td>
                  <td className="px-4 py-2">
                    <Pigulka ton={STATUS[k.status].ton} className="!text-xs">
                      {STATUS[k.status].t}
                    </Pigulka>
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {k.wyslano}/{k.odbiorcow}
                    {k.bledow ? <span className="block text-xs text-rose-300">{k.bledow} {plForm(k.bledow, "błąd", "błędy", "błędów")}</span> : null}
                    {k.pominieto ? <span className="block text-xs text-muted-foreground">{k.pominieto} pominiętych</span> : null}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {k.autor ?? "—"}
                    <span className="block">{kiedy(k.utworzono)}</span>
                  </td>
                  <td className="px-4 py-2 text-right">{k.status === "WYSYLANY" ? <ZatrzymajKomunikat id={k.id} /> : null}</td>
                </tr>
              ))}
              {lista.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-muted-foreground">
                    Nie wysłano jeszcze żadnego komunikatu.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
