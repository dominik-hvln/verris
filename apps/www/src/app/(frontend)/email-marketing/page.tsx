import type { Metadata } from 'next';
import { Accordion, Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead, Steps, type Step } from '../components/ui';
import { PANEL } from '@/lib/site';
import { serviceSchema } from '@/lib/schema';
import { notFound } from 'next/navigation';
import { EMAIL_MARKETING_W_SPRZEDAZY, PAKIETY_NEWSLETTER } from '@/lib/oferta';

const liczba = (n: number) => n.toLocaleString('pl-PL');

export const metadata: Metadata = {
  title: 'E-mail marketing — wysyłki do własnych list | Verris',
  description:
    'Usługa e-mail marketingu Verris: wysyłki do własnych list odbiorców prosto z panelu, z naciskiem na dostarczalność. Zgody odbiorców po stronie klienta, każdy mail z linkiem rezygnacji (PKE/RODO).',
  alternates: { canonical: '/email-marketing' },
};

const KROKI: Step[] = [
  { label: '01', title: 'Budujesz kampanię', text: 'Budujesz kampanię i wysyłasz do własnej listy odbiorców z panelu.' },
  { label: '02', title: 'Dbamy o dostarczalność', text: 'Stawiamy na dostarczalność — poprawną konfigurację nadawcy i reputację.' },
  { label: '03', title: 'Zgody zostają u Ciebie', text: 'Zgody odbiorców zbierasz i przechowujesz Ty (jako administrator swoich danych).' },
];

const FAQ: [string, string][] = [
  [
    'Kto odpowiada za zgody odbiorców?',
    'Ty, jako administrator swoich danych. E-mail marketing wymaga uprzedniej zgody odbiorcy (rekomendowany double opt-in).',
  ],
  ['Co musi zawierać każda wiadomość?', 'Działający link rezygnacji i dane nadawcy. To wymóg prawny (PKE/RODO), nie tylko dobra praktyka.'],
  ['Czy mogę użyć kupionej bazy adresowej?', 'Nie. Nie używaj kupionych ani cudzych baz adresowych.'],
];

export default function Page() {
  // Do ukończenia usługi strona nie istnieje (decyzja 2026-09-28) — w panelu nie da się jej kupić.
  if (!EMAIL_MARKETING_W_SPRZEDAZY) notFound();
  return (
    <main>
      <JsonLd
        data={serviceSchema({
          name: 'E-mail marketing',
          description:
            'Wysyłki do własnych list odbiorców z panelu, z naciskiem na dostarczalność. Zgodność z PKE/RODO (double opt-in, link rezygnacji).',
          path: '/email-marketing',
        })}
      />

      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap hero2-grid">
          <div>
            <Breadcrumbs items={[{ label: 'E-mail marketing' }]} />
            <h1>Wysyłki do własnych list — z jednego panelu</h1>
            <p className="lead">
              Docieraj do swoich odbiorców e-mailem, z naciskiem na dostarczalność. Narzędzie dajemy my; zgody odbiorców
              i treść zostają po Twojej stronie.
            </p>
            <div className="hero2-cta">
              <Button href={PANEL} cta="subhero" conv="checkout_intent" plan="email-marketing">
                Zacznij w panelu
              </Button>
              <Button href="/hosting" variant="ghost" cta="subhero-alt">
                Zobacz hosting
              </Button>
            </div>
          </div>
          <Card className="incl">
            <h2 className="incl-h">Pakiety (brutto)</h2>
            <dl>
              {PAKIETY_NEWSLETTER.map((p) => (
                <div key={p.nazwa}>
                  <dt>{p.nazwa}</dt>
                  <dd>{p.miesiecznie} zł/mies.</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <SectionHead eyebrow="Jak to działa" title="Narzędzie po naszej stronie, zgody po Twojej" />
          <Steps items={KROKI} />
        </div>
      </section>

      <section className="sec sec-alt" id="pakiety">
        <div className="wrap">
          <SectionHead eyebrow="Pakiety" title="Wybierz pakiet" />
          <div className="duo">
            {PAKIETY_NEWSLETTER.map((p) => (
              <Card key={p.nazwa}>
                <h3>{p.nazwa}</h3>
                <p>
                  {p.miesiecznie} zł/mies. lub {p.rocznie} zł/rok (brutto): do {liczba(p.kontakty)} kontaktów i{' '}
                  {liczba(p.wysylki)} wysyłek miesięcznie.
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" id="zgodnosc">
        <div className="wrap narrow">
          <SectionHead
            eyebrow="Zgodność (PKE / RODO)"
            title="Zgody i rezygnacja — wymóg prawny"
            lead="E-mail marketing wymaga uprzedniej zgody odbiorcy (rekomendowany double opt-in), a każda wiadomość musi zawierać działający link rezygnacji i dane nadawcy. Nie używaj kupionych ani cudzych baz adresowych."
          />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
        </div>
      </section>

      <CTABand
        title="Zacznij wysyłać odpowiedzialnie"
        text="Uruchom e-mail marketing w panelu i dbaj o zgody swoich odbiorców."
        primaryLabel="Przejdź do panelu"
      />
    </main>
  );
}
