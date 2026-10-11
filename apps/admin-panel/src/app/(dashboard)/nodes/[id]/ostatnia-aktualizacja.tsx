import Link from "next/link";
import type { PrzegladWezla } from "./przeglad-data";

type Aktualizacja = NonNullable<PrzegladWezla["aktualizacja"]>;

const STATUS: Record<string, string> = { QUEUED: "w kolejce", RUNNING: "w toku", COMPLETED: "zakończona", FAILED: "nieudana", CANCELLED: "anulowana" };
const WYNIK: Record<NonNullable<Aktualizacja["wynik"]>, { tekst: string; ton: string }> = {
  ok: { tekst: "wszystko zaktualizowane", ton: "text-data-hi" },
  "needs-reboot": { tekst: "zaktualizowane — węzeł wymaga restartu (nowe jądro)", ton: "text-warn" },
  failed: { tekst: "aktualizacja z błędami", ton: "text-crit" },
};

const data = (iso: string) => new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" });

/**
 * Weryfikacja 11.10 — wynik OSTATNIEGO przebiegu „Aktualizuj ten węzeł” (albo kroku fali), także udanego, z datą
 * i końcówką wyjścia skryptu. Wcześniej karta pokazywała tylko błędy zadań: po udanym przebiegu dalej było widać
 * wyjście starszego, nieudanego (lock CustomBuild, VERRIS_UPDATE_RESULT=failed). Starsze przebiegi — w „Zadaniach”.
 */
export function OstatniaAktualizacja({ a, zadaniaHref }: { a: Aktualizacja | null; zadaniaHref: string }) {
  if (!a) return <p className="text-xs text-muted-foreground">Ten węzeł nie był jeszcze aktualizowany z panelu.</p>;
  const ostrz = a.ostrzezenia ?? 0;
  // Weryfikacja 11.10 — build przeszedł, ale wypisał „Error:” (t1: CageFS /run/mysql): nie „wszystko zaktualizowane”.
  const wynik = a.wynik === "ok" && ostrz > 0
    ? { tekst: `zaktualizowane z ostrzeżeniami (${ostrz}) — linie „OSTRZEŻENIE” na końcu wyjścia`, ton: "text-warn" }
    : a.wynik ? WYNIK[a.wynik] : null;
  const trwa = a.status === "QUEUED" || a.status === "RUNNING";
  return (
    <div className="space-y-2 rounded-lg border border-line p-3" data-ostatnia-aktualizacja={a.id}>
      <p className="text-sm">
        Ostatni przebieg: <strong>{STATUS[a.status] ?? a.status}</strong>{" "}
        <span className="text-muted-foreground">
          · zlecono {data(a.zlecono)}
          {a.zakonczono ? ` · zakończono ${data(a.zakonczono)}` : ""}
        </span>
        {wynik && !trwa ? <span className={`block text-xs ${wynik.ton}`}>Wynik: {wynik.tekst}.</span> : null}
      </p>
      {a.status === "FAILED" && a.blad ? <p className="text-xs text-crit">{a.blad}</p> : null}
      {a.wyjscie ? (
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/50 p-2 font-mono text-[11px] text-neutral-300">{a.wyjscie}</pre>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Wcześniejsze przebiegi:{" "}
        <Link href={zadaniaHref} className="underline underline-offset-2 hover:text-foreground">
          historia zadań
        </Link>
        .
      </p>
    </div>
  );
}
