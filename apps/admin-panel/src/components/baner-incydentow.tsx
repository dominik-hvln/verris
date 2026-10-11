import Link from "next/link";
import { plForm } from "@/lib/pl";

/** F3.8 (ON-05) — dane z GET admin/status-obslugi (apps/api/src/komunikacja/status-obslugi.service.ts). */
export type StanObslugi = {
  incydenty: { id: string; tytul: string; powazny: boolean; od: string; usluga: string; wezel: { id: string; nazwa: string; kont: number } | null }[];
  prace: { id: string; tytul: string; trwa: boolean; od: string; do: string; wezel: { id: string; nazwa: string; kont: number } | null; calaPlatforma: boolean }[];
};

const godz = (iso: string) => new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const kont = (n: number) => `${n} ${plForm(n, "konto", "konta", "kont")}`;

/**
 * „Czy to awaria u was?” — trwające incydenty i prace serwisowe (trwające i w ciągu 24 h) na górze każdej strony panelu
 * operatora, z węzłem i liczbą kont na nim. Nic nie trwa — baner się nie pokazuje.
 */
export function BanerIncydentow({ stan }: { stan: StanObslugi | null }) {
  if (!stan || (!stan.incydenty.length && !stan.prace.length)) return null;
  const wezel = (w: { id: string; nazwa: string; kont: number } | null, cala = false) =>
    w ? (
      <Link href={`/nodes/${w.id}`} className="font-semibold underline">
        {w.nazwa} ({kont(w.kont)})
      </Link>
    ) : cala ? (
      <b>cała platforma</b>
    ) : null;
  return (
    <div className="mb-4 flex flex-col gap-1.5" role="status" aria-label="Trwające incydenty i prace serwisowe" data-baner-incydentow>
      {stan.incydenty.map((i) => (
        <p key={i.id} className={`rounded-lg border px-3 py-2 text-[13px] ${i.powazny ? "border-rose-500/40 bg-rose-500/10 text-rose-100" : "border-amber-400/40 bg-amber-400/10 text-amber-100"}`} data-incydent={i.id}>
          <b>{i.powazny ? "Awaria" : "Problem"}:</b> {i.tytul} · {i.usluga}
          {i.wezel ? <> · węzeł {wezel(i.wezel)}</> : null} · od {godz(i.od)}
        </p>
      ))}
      {stan.prace.map((p) => (
        <p key={p.id} className="rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-[13px] text-sky-100" data-prace={p.id}>
          <b>{p.trwa ? "Trwają prace" : "Prace serwisowe"}:</b> {p.tytul} · {wezel(p.wezel, p.calaPlatforma)} · {godz(p.od)}–{godz(p.do)}
        </p>
      ))}
    </div>
  );
}
