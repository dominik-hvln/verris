import { ExternalLink, Trees } from 'lucide-react';
import { Kpi, KpiStrip, Meter } from '@/components/panel/v2';
import type { EcoDrzewaDto } from './eco-data';
import { CZESCI_DRZEWA, drzewaSlownie, liczbaDrzew, procentDrzewa, punktyZaProcent } from './drzewa-format';
import { EcoDrzewaWymiana } from './eco-drzewa-wymiana';

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' }) : '—');

/**
 * Drzewa w programie EKO (W6, decyzja 12). Sadzi partner na zamówienie Verris; „posadzone” mówimy wyłącznie
 * o drzewach, dla których partner wystawił certyfikat. Wszystko inne to „w puli” albo „w realizacji”.
 * Decyzje 16–17 (4.11.2026): wkład tylko od części zapłaconej pieniędzmi; certyfikaty wyłącznie na Verris.
 */
export function EcoDrzewa({ d }: { d: EcoDrzewaDto }) {
  return (
    <section className="space-y-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 md:p-8">
      <div className="max-w-3xl">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Trees className="h-5 w-5 text-emerald-400" aria-hidden />
          Drzewa
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          Za każde 100 zł netto zapłacone za usługi dokładamy {procentDrzewa(d.wkladNa100ZlNetto)} drzewa do wspólnej puli
          — automatycznie, bez dopłat z Twojej strony. Wkład liczymy tylko od tego, co zapłacisz pieniędzmi: kredyty
          z kodów (np. BETA), promocji, poleceń i rekompensat schodzą z portfela najpierw i nie dają wkładu. Punkty EKO
          możesz też wymienić na procent drzewa do puli albo na własne drzewo z certyfikatem. Gdy pula uzbiera całe
          drzewo, zamawiamy jego posadzenie u partnera. Drzewo liczymy jako posadzone dopiero wtedy, gdy partner wystawi
          certyfikat.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          Certyfikaty wystawiamy na Verris — z tekstem „Drzewo posadzone dzięki klientom Verris”, także przy Twoim własnym
          drzewie. Partner sadzenia nie dostaje Twoich danych; to, które drzewa są Twoje, widzisz tutaj, w panelu.
        </p>
      </div>

      <KpiStrip>
        <Kpi label="Drzewa Verris" value={d.liczniki.verris} foot={<span>posadzone, z certyfikatem</span>} />
        <Kpi
          label="Z Twojego wkładu"
          value={liczbaDrzew(d.liczniki.zWkladuCzesci)}
          foot={<span>Twój udział w drzewach zbiorczych</span>}
        />
        <Kpi label="Twoje drzewa" value={d.liczniki.wlasne} foot={<span>własne, z certyfikatem</span>} />
        <Kpi label="Wspólna pula" value={procentDrzewa(d.pulaCzesci)} foot={<span>do kolejnego drzewa zbiorczego</span>}>
          <Meter pct={(d.pulaCzesci / CZESCI_DRZEWA) * 100} />
        </Kpi>
      </KpiStrip>

      {d.czekaCzesci > 0 ? (
        <p className="text-sm text-neutral-400">
          Czeka na posadzenie: {procentDrzewa(d.czekaCzesci)} drzewa z Twoich wkładów.
        </p>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-black/30 p-5">
        <h3 className="text-sm font-semibold text-white">Wymień punkty na drzewa</h3>
        <p className="mb-4 mt-1 text-xs text-neutral-500">
          Masz {d.punkty} pkt. Całe drzewo to {d.punktyNaDrzewo} pkt, 1% drzewa — {punktyZaProcent(1, d.punktyNaDrzewo)} pkt.
        </p>
        <EcoDrzewaWymiana punkty={d.punkty} punktyNaDrzewo={d.punktyNaDrzewo} maksWlasnychNaRaz={d.maksWlasnychNaRaz} />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white">Certyfikaty</h3>
        {d.certyfikaty.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            Nie masz jeszcze certyfikatów. Pojawią się tutaj, gdy partner potwierdzi posadzenie drzewa zbiorczego z Twoim
            udziałem albo Twojego własnego drzewa.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {d.certyfikaty.map((c) => (
              <li key={c.id} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-neutral-200">
                    {c.rodzaj === 'WLASNE'
                      ? `Własne: ${drzewaSlownie(c.liczbaDrzew * CZESCI_DRZEWA)}`
                      : `Drzewa zbiorcze (${c.liczbaDrzew}) — Twój udział ${procentDrzewa(c.mojeCzesci)} drzewa`}
                  </span>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {c.status === 'POSADZONE' ? data(c.posadzoneAt) : 'w realizacji'}
                  </span>
                </div>
                {c.testowe ? (
                  <p className="mt-1 text-xs text-amber-300/80">Zamówienie testowe — to drzewo nie zostało naprawdę posadzone.</p>
                ) : null}
                {c.status === 'POSADZONE' && c.certificateUrl ? (
                  <a
                    href={c.certificateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-emerald-400 underline hover:text-emerald-300"
                  >
                    Otwórz certyfikat <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ) : (
                  <p className="mt-2 text-xs text-neutral-500">Certyfikat pojawi się po potwierdzeniu przez partnera.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
