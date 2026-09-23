import type { Metadata } from 'next';
import { SubHero } from '../components/ui';
import { AbuseForm } from '../components/AbuseForm';

export const metadata: Metadata = {
  title: 'Zgłoś nadużycie — Verris',
  description: 'Zgłoś phishing, malware, spam lub nielegalną treść na stronie hostowanej w Verris. Każde zgłoszenie rozpatruje człowiek i informujemy o decyzji.',
  alternates: { canonical: '/zglos-naduzycie' },
};

/** N-13 — punkt zgłaszania nielegalnych treści (DSA art. 16). */
export default function Page() {
  return (
    <main>
      <SubHero
        eyebrow="Nadużycia"
        title="Zgłoś nadużycie"
        lead="Phishing, złośliwe oprogramowanie, spam albo nielegalna treść na stronie hostowanej u nas? Zgłoś — rozpatrzy to człowiek, a o decyzji poinformujemy Cię mailem."
        crumbs={[{ label: 'Zgłoś nadużycie' }]}
      />
      <section>
        <div className="wrap">
          <div className="contact-grid">
            <div>
              <AbuseForm />
            </div>
            <div className="contact-side">
              <div className="icard">
                <h3>Co musi zawierać zgłoszenie</h3>
                <p>Dokładny adres treści, opis naruszenia z uzasadnieniem, Twój e-mail i oświadczenie o dobrej wierze. Bez adresu nie znajdziemy treści.</p>
              </div>
              <div className="icard">
                <h3>Co dzieje się dalej</h3>
                <p>Od razu dostajesz potwierdzenie z numerem. Po sprawdzeniu — decyzję z uzasadnieniem. Jeśli ograniczymy usługę, klient też dostaje uzasadnienie i może się odwołać.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
