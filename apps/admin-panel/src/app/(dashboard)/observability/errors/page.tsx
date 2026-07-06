import { getRuntimeErrors } from "./data";

export const dynamic = "force-dynamic";

/**
 * CYBER-9 / OBS-1 — widok błędów runtime w panelu admina (ADMIN/STAFF).
 * Ostatnie zdarzenia z ring buffera API + agregaty. Pełna historia/triage w
 * self-hosted GlitchTip (link poniżej).
 */
export default async function RuntimeErrorsPage() {
  let data: Awaited<ReturnType<typeof getRuntimeErrors>> | null = null;
  let error: string | null = null;
  try {
    data = await getRuntimeErrors(100);
  } catch (e) {
    error = e instanceof Error ? e.message : "Nie udało się pobrać błędów.";
  }

  const glitchtipUrl =
    process.env.NEXT_PUBLIC_GLITCHTIP_URL || "https://glitchtip.verris.pl";

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Błędy runtime</h1>
          <p className="text-sm text-muted-foreground">
            Ostatnie błędy serwera (5xx). Pełna historia i triage w GlitchTip.
          </p>
        </div>
        <a
          href={glitchtipUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Otwórz GlitchTip ↗
        </a>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {data ? (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl border border-border px-4 py-3">
              <div className="text-2xl font-bold">{data.summary.total}</div>
              <div className="text-xs text-muted-foreground">błędów łącznie (od startu)</div>
            </div>
            {data.summary.byType.slice(0, 6).map((t) => (
              <div key={t.type} className="rounded-xl border border-border px-4 py-3">
                <div className="text-2xl font-bold">{t.count}</div>
                <div className="text-xs text-muted-foreground">{t.type}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Czas</th>
                  <th className="px-3 py-2">Typ</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Ścieżka</th>
                  <th className="px-3 py-2">Wiadomość</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      Brak błędów runtime 🎉
                    </td>
                  </tr>
                ) : (
                  data.recent.map((e) => (
                    <tr key={e.id} className="border-t border-border align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                        {new Date(e.at).toLocaleString("pl-PL")}
                      </td>
                      <td className="px-3 py-2 font-medium">{e.type}</td>
                      <td className="px-3 py-2">{e.status ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {e.method} {e.path}
                      </td>
                      <td className="px-3 py-2">{e.message}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Bufor ostatnich {data.recent.length} zdarzeń (in-memory). Metryka Grafana:{" "}
            <code>verris_runtime_errors_total</code>.
          </p>
        </>
      ) : null}
    </div>
  );
}
