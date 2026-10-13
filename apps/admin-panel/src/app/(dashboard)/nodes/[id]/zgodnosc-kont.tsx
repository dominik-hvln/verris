import Link from "next/link";

export type ZgodnoscKont = {
  sieroty: Array<{ daUsername: string; gdzieIndziej: { serverId: string; serverName: string | null } | null }>;
  brakujace: Array<{ daUsername: string; domain: string | null; accountId: string }>;
  sprawdzono: string;
};

/**
 * H-16 (13.10): po przeniesieniu konta na inny węzeł na starym zostawało konto DirectAdmin bez usługi w panelu —
 * dalej odpowiadało za strefę DNS i przyjmowało pocztę. Karta pokazuje takie konta (do usunięcia na węźle po
 * sprawdzeniu) i konta panelu, których DirectAdmin nie zna. Tylko odczyt.
 */
export function ZgodnoscKontKarta({ dane }: { dane: ZgodnoscKont }) {
  const czysto = dane.sieroty.length === 0 && dane.brakujace.length === 0;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-5 text-sm" data-zgodnosc-kont="">
      {czysto ? (
        <p className="text-emerald-300">Konta w DirectAdmin zgadzają się z panelem.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {dane.sieroty.length > 0 ? (
            <div>
              <p className="font-semibold text-amber-200">Konta w DirectAdmin bez usługi na tym węźle ({dane.sieroty.length})</p>
              <ul className="mt-2 flex flex-col gap-1 text-neutral-300">
                {dane.sieroty.map((s) => (
                  <li key={s.daUsername} className="break-words">
                    <code className="font-mono">{s.daUsername}</code>
                    {s.gdzieIndziej ? (
                      <>
                        {" "}— usługa jest teraz na węźle{" "}
                        <Link className="underline" href={`/nodes/${s.gdzieIndziej.serverId}`}>
                          {s.gdzieIndziej.serverName ?? s.gdzieIndziej.serverId}
                        </Link>
                        ; to pozostałość po przeniesieniu (odpowiada za DNS i pocztę, dopóki istnieje).
                      </>
                    ) : (
                      " — nie ma go w panelu."
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {dane.brakujace.length > 0 ? (
            <div>
              <p className="font-semibold text-rose-200">Konta panelu, których nie ma w DirectAdmin ({dane.brakujace.length})</p>
              <ul className="mt-2 flex flex-col gap-1 text-neutral-300">
                {dane.brakujace.map((b) => (
                  <li key={b.accountId} className="break-words">
                    <code className="font-mono">{b.daUsername}</code>
                    {b.domain ? ` · ${b.domain}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
      <p className="mt-3 text-xs text-neutral-500">Sprawdzono {new Date(dane.sprawdzono).toLocaleString("pl-PL")}.</p>
    </div>
  );
}
