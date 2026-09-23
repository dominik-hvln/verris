import type { SlaPodglad } from './actions';

/** N-16 — podgląd rekompensat za poprzedni miesiąc na prawdziwych danych sond, przed włączeniem. */
export function SlaPreview({ data }: { data: SlaPodglad | null }) {
  return (
    <section className="max-w-2xl space-y-3 rounded-2xl border border-white/10 bg-black/30 p-6">
      <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-400">Podgląd kredytów SLA</h2>
      {!data ? (
        <p className="text-xs text-neutral-400">Nie udało się policzyć podglądu.</p>
      ) : data.pozycje.length === 0 ? (
        <p className="text-xs text-neutral-400">
          Za {data.okres} nikomu nie przysługuje rekompensata — każda usługa hostingowa miała dostępność co najmniej 99,5%
          (albo nie było incydentów MAJOR).
        </p>
      ) : (
        <>
          <p className="text-xs text-neutral-400">
            Za {data.okres} po włączeniu przyznalibyśmy {data.pozycje.length} rekompensat na łącznie {data.suma} zł. Nic tu nie
            jest zapisywane.
          </p>
          <table className="w-full text-left text-xs">
            <thead className="text-neutral-500">
              <tr>
                <th className="py-1 font-medium">Usługa</th>
                <th className="py-1 font-medium">Dostępność</th>
                <th className="py-1 font-medium">Przestój</th>
                <th className="py-1 font-medium">Próg</th>
                <th className="py-1 text-right font-medium">Kwota</th>
              </tr>
            </thead>
            <tbody className="text-neutral-200">
              {data.pozycje.map((p) => (
                <tr key={p.subscriptionId} className="border-t border-white/5">
                  <td className="py-1.5">{p.domain ?? p.planName ?? p.subscriptionId}</td>
                  <td className="py-1.5 tabular-nums">{p.dostepnosc.replace('.', ',')}%</td>
                  <td className="py-1.5 tabular-nums">
                    {p.przestojMin} min{p.konserwacjaMin > 0 ? ` (−${p.konserwacjaMin} konserwacja)` : ''}
                  </td>
                  <td className="py-1.5 tabular-nums">{p.progProcent}%</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {p.kwota.replace('.', ',')} {p.waluta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
