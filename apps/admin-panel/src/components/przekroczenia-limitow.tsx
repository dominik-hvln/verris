import Link from "next/link";
import { krotkoFaulty, stanRaportu, type Faulty } from "@/components/faulty-limitow";
import { KARTA } from "@/components/v2";

/** Odpowiedź `GET /admin/servers/przekroczenia[?wezel=]` (apps/api/src/servers/przekroczenia-limitow.ts). */
export interface Przekroczenia {
  wiersze: {
    serverId: string;
    wezel: string;
    username: string;
    subscriptionId: string | null;
    domena: string | null;
    doba: Faulty | null;
    tydzien: Faulty | null;
    razemDoba: number;
    razemTydzien: number;
  }[];
  wezly: { serverId: string; wezel: string; odczytano: string | null; nieaktualne: boolean; blad: string | null; obcieto: boolean }[];
}

const TON = { ok: "text-muted-foreground", warn: "text-warn", crit: "text-crit" } as const;

/**
 * F2.6 — konta przekraczające limity (faulty w dobie / 7 dni) we flocie albo na węźle; nad tabelą stan raportu węzłów,
 * które nie raportują albo zgłosiły błąd — wtedy brak wiersza nie znaczy „bez przekroczeń”.
 */
export function PrzekroczeniaLimitow({ dane, teraz, zWezlem }: { dane: Przekroczenia; teraz: number; zWezlem: boolean }) {
  const problemy = dane.wezly.map((w) => ({ w, s: stanRaportu(w, teraz) })).filter(({ w, s }) => s.ton !== "ok" || w.obcieto);
  const bezProblemow = dane.wezly.length - problemy.length;
  return (
    <div className="flex flex-col gap-3">
      {problemy.length ? (
        <ul className="flex flex-col gap-1 text-[13px]" aria-label="Stan raportów węzłów">
          {problemy.map(({ w, s }) => (
            <li key={w.serverId} className={TON[s.ton]} data-raport-wezla={s.ton}>
              {zWezlem ? (
                <Link href={`/nodes/${w.serverId}`} className="font-mono hover:underline">
                  {w.wezel}
                </Link>
              ) : null}
              {zWezlem ? ": " : ""}
              {s.ton !== "ok" ? s.tekst : null}
              {w.obcieto ? `${s.ton !== "ok" ? " " : ""}Na węźle jest więcej kont z faultami niż w raporcie (pokazano 200 najgorszych).` : null}
            </li>
          ))}
        </ul>
      ) : null}
      {dane.wiersze.length === 0 ? (
        <div className={`${KARTA} px-5 py-6 text-sm text-muted-foreground`} data-pusto>
          {dane.wezly.length === 0
            ? "Brak aktywnych węzłów."
            : bezProblemow
              ? "Żadne konto nie odbiło się od limitu w ostatnich 7 dniach."
              : "Brak danych — żaden węzeł nie przysłał aktualnego raportu."}
        </div>
      ) : (
        <div className={`${KARTA} overflow-x-auto`}>
          <table className="w-full text-[13px]">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 font-medium">Konto</th>
                {zWezlem ? <th className="px-4 py-2.5 font-medium">Węzeł</th> : null}
                <th className="px-4 py-2.5 font-medium">Doba</th>
                <th className="px-4 py-2.5 font-medium">7 dni</th>
              </tr>
            </thead>
            <tbody>
              {dane.wiersze.map((r) => (
                <tr key={`${r.serverId}:${r.username}`} className="border-b border-line last:border-0" data-konto={r.username}>
                  <td className="px-4 py-2.5">
                    {r.subscriptionId ? (
                      <Link href={`/subscriptions/${r.subscriptionId}?sekcja=konto#zasoby-konta`} className="font-medium text-foreground hover:underline">
                        {r.domena ?? r.username}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{r.username} · poza panelem</span>
                    )}
                    {r.subscriptionId && r.domena ? <span className="ml-2 font-mono text-xs text-muted-foreground">{r.username}</span> : null}
                  </td>
                  {zWezlem ? (
                    <td className="px-4 py-2.5">
                      <Link href={`/nodes/${r.serverId}?sekcja=konta#przekroczenia`} className="font-mono text-xs hover:underline">
                        {r.wezel}
                      </Link>
                    </td>
                  ) : null}
                  <td className={`px-4 py-2.5 font-mono text-xs ${r.razemDoba ? "text-crit" : "text-muted-foreground"}`}>{krotkoFaulty(r.doba)}</td>
                  <td className={`px-4 py-2.5 font-mono text-xs ${r.razemTydzien ? "text-warn" : "text-muted-foreground"}`}>{krotkoFaulty(r.tydzien)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
