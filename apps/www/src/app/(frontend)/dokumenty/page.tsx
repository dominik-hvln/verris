import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, ShieldCheck, Cookie, Handshake, Users, Gauge, Receipt, Flag } from 'lucide-react';
import type { ReactNode } from 'react';
import { JsonLd, SectionHead, SubHero } from '../components/ui';
import { LEGAL } from '@/lib/site';
import { SITE, webPageSchema } from '@/lib/schema';

const OPIS =
  'Regulamin, polityka prywatności, polityka cookies, umowa powierzenia danych (DPA) i lista podprocesorów Verris — aktualne wersje online.';

export const metadata: Metadata = {
  title: 'Regulamin, RODO i umowa powierzenia (DPA) | Verris',
  description: OPIS,
  alternates: { canonical: '/dokumenty' },
};

type Pozycja = { ikona: ReactNode; tytul: string; opis: string; meta: string; href: string };

/**
 * Dokumenty prawne publikowane w panelu (apps/client-panel/src/app/legal/dokumenty.tsx → LEGAL_DOCS:
 * terms, privacy, cookies, dpa). Lista podprocesorów nie jest osobnym dokumentem — to pkt 5.1 polityki
 * prywatności i załącznik do DPA (docs/legal/drafts/subprocessors.md), więc link prowadzi do polityki.
 */
const DOKUMENTY: Pozycja[] = [
  {
    ikona: <FileText />,
    tytul: 'Regulamin świadczenia usług',
    opis: 'Zasady usług, płatności, odnowień oraz SLA i rekompensat.',
    meta: 'aktualna wersja i historia zmian',
    href: `${LEGAL}/terms`,
  },
  {
    ikona: <ShieldCheck />,
    tytul: 'Polityka prywatności',
    opis: 'Jakie dane zbieramy, po co, jak długo je trzymamy i jakie masz prawa.',
    meta: 'aktualna wersja i historia zmian',
    href: `${LEGAL}/privacy`,
  },
  {
    ikona: <Cookie />,
    tytul: 'Polityka cookies',
    opis: 'Które pliki są niezbędne, a na które pytamy o zgodę.',
    meta: 'aktualna wersja i historia zmian',
    href: `${LEGAL}/cookies`,
  },
  {
    ikona: <Handshake />,
    tytul: 'Umowa powierzenia danych (DPA)',
    opis: 'Dla firm: akceptujesz ją w panelu klienta, bez drukowania i skanowania.',
    meta: 'akceptacja w panelu',
    href: `${LEGAL}/dpa`,
  },
  {
    ikona: <Users />,
    tytul: 'Lista podprocesorów',
    opis: 'Firmy, które pomagają nam świadczyć usługę — w polityce prywatności i w załączniku do DPA.',
    meta: 'część polityki prywatności',
    href: `${LEGAL}/privacy`,
  },
];

const NA_STRONIE: Pozycja[] = [
  {
    ikona: <Gauge />,
    tytul: 'SLA i rekompensaty',
    opis: 'Jak liczymy dostępność 99,5% i ile oddajemy za przerwy.',
    meta: 'opis zasad z regulaminu',
    href: '/funkcje/sla',
  },
  {
    ikona: <Receipt />,
    tytul: 'Cennik',
    opis: 'Wszystkie ceny brutto w jednym miejscu.',
    meta: 'ceny brutto',
    href: '/cennik',
  },
  {
    ikona: <ShieldCheck />,
    tytul: 'RODO i DPA w praktyce',
    opis: 'Co dostajesz jako firma: dokumenty online, DPA w panelu, dane w UE.',
    meta: 'objaśnienie',
    href: '/funkcje/rodo-i-dpa',
  },
  {
    ikona: <Flag />,
    tytul: 'Zgłoś nadużycie',
    opis: 'Spam, phishing, złośliwe oprogramowanie albo treści niezgodne z prawem.',
    meta: 'formularz',
    href: '/zglos-naduzycie',
  },
];

function Lista({ items }: { items: Pozycja[] }) {
  return (
    <ul className="d-docs">
      {items.map((d) => {
        const tresc = (
          <>
            <span className="d-docs-ico" aria-hidden="true">
              {d.ikona}
            </span>
            <span className="d-docs-txt">
              <span className="d-docs-t">{d.tytul}</span>
              <span className="d-docs-o">{d.opis}</span>
              <span className="d-docs-m">{d.meta}</span>
            </span>
          </>
        );
        return (
          <li key={d.tytul}>
            {d.href.startsWith('/') ? <Link href={d.href}>{tresc}</Link> : <a href={d.href}>{tresc}</a>}
          </li>
        );
      })}
    </ul>
  );
}

export default function Page() {
  return (
    <main>
      <JsonLd
        data={webPageSchema({
          type: 'CollectionPage',
          name: 'Dokumenty i RODO — Verris',
          description: OPIS,
          path: '/dokumenty',
          extra: {
            hasPart: [...DOKUMENTY, ...NA_STRONIE].map((d) => ({
              '@type': 'WebPage',
              name: d.tytul,
              url: d.href.startsWith('/') ? `${SITE}${d.href}` : d.href,
            })),
          },
        })}
      />

      <SubHero
        eyebrow="Dokumenty i RODO"
        title="Wszystkie dokumenty w jednym miejscu. Napisane tak, żeby dało się je przeczytać"
        lead="Regulamin, polityka prywatności i umowa powierzenia — dostępne online w aktualnej wersji, z historią poprzednich wersji. Bez proszenia i bez czekania na skan."
        crumbs={[{ label: 'Dokumenty' }]}
      />

      <section className="sec">
        <div className="wrap">
          <SectionHead
            eyebrow="Dokumenty prawne"
            title="Regulamin, prywatność i umowa powierzenia"
            lead="Dokumenty publikujemy w panelu klienta. Każdy ma numer wersji, datę obowiązywania i historię zmian — bez logowania."
          />
          <Lista items={DOKUMENTY} />
          <p className="d-docs-note">
            Dla firm: umowę powierzenia przetwarzania danych (DPA) akceptujesz w panelu klienta. Pytania o ochronę
            danych: <a href="mailto:rodo@verris.pl">rodo@verris.pl</a>.
          </p>
        </div>
      </section>

      <section className="sec sec-alt">
        <div className="wrap">
          <SectionHead eyebrow="Na verris.pl" title="Zasady opisane prostym językiem" />
          <Lista items={NA_STRONIE} />
        </div>
      </section>
    </main>
  );
}
