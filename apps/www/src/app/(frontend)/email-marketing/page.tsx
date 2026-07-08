import type { Metadata } from 'next';
import { SubHero, CTABand } from '../components/ui';
import { RevealInit } from '../components/RevealInit';
import { PANEL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'E-mail marketing — wysyłki do własnych list | Verris',
  description:
    'Usługa e-mail marketingu Verris: wysyłki do własnych list odbiorców prosto z panelu, z naciskiem na dostarczalność. Zgody odbiorców po stronie klienta, każdy mail z linkiem rezygnacji (PKE/RODO).',
  alternates: { canonical: '/email-marketing' },
};

export default function Page() {
  return (
    <main>
      <SubHero
        eyebrow="E-mail marketing"
        title="Wysyłki do własnych list — z jednego panelu"
        lead="Docieraj do swoich odbiorców e-mailem, z naciskiem na dostarczalność. Narzędzie dajemy my; zgody odbiorców i treść zostają po Twojej stronie."
        crumbs={[{ label: 'E-mail marketing' }]}
        primary={{ label: 'Zacznij w panelu', href: PANEL, conv: 'begin_checkout' }}
        secondary={{ label: 'Zobacz hosting', href: '/hosting' }}
      />
      <section>
        <div className="wrap">
          <div className="prose rv">
            <h2>Jak to działa</h2>
            <ul>
              <li>Budujesz kampanię i wysyłasz do własnej listy odbiorców z panelu.</li>
              <li>Stawiamy na dostarczalność — poprawną konfigurację nadawcy i reputację.</li>
              <li>Zgody odbiorców zbierasz i przechowujesz Ty (jako administrator swoich danych).</li>
            </ul>
            <h2>Zgodność (PKE / RODO)</h2>
            <p>
              E-mail marketing wymaga <strong>uprzedniej zgody</strong> odbiorcy (rekomendowany
              double opt-in), a każda wiadomość musi zawierać działający link rezygnacji i dane
              nadawcy. Nie używaj kupionych ani cudzych baz adresowych. To nie tylko dobra praktyka —
              to wymóg prawny.
            </p>
          </div>
        </div>
      </section>
      <CTABand
        title="Zacznij wysyłać odpowiedzialnie"
        text="Uruchom e-mail marketing w panelu i dbaj o zgody swoich odbiorców."
        primaryLabel="Przejdź do panelu"
      />
      <RevealInit />
    </main>
  );
}
