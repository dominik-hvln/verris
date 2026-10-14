import type { Metadata } from 'next';
import Link from 'next/link';
import { Accordion, Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead, Steps, type Step } from '../../components/ui';
import { faqSchema, howToSchema } from '@/lib/schema';
import { ZAMOW } from '@/lib/site';

/*
 * /funkcje/kopie-zapasowe — makieta 14.10 (FunkcjaKopie.dc.html). Statyczna trasa ma pierwszeństwo przed
 * /funkcje/[slug] (tam `kopie-zapasowe` jest wyłączone z generateStaticParams).
 * Pokrycie w kodzie: apps/api/src/subscriptions/hosting-restore.service.ts (zakres pliki/bazy/poczta,
 * safetyBackup domyślnie włączone, confirmDomain), file-restore.service.ts (pojedynczy plik do osobnego katalogu),
 * offsite-restore.service.ts (kopia spoza serwera: pobranie z panelu, przywrócenie przez obsługę — weryfikacja 11.10).
 */

export const metadata: Metadata = {
  title: 'Kopia zapasowa strony i backup WordPress | Verris',
  description:
    'Codzienne kopie strony, bazy i poczty, 30 dni historii poza serwerem i przywracanie z panelu bez zgłoszeń. W cenie hostingu Verris.',
  alternates: { canonical: '/funkcje/kopie-zapasowe' },
};

const WARSTWY: { tag: string; title: string; text: string }[] = [
  {
    tag: '7 kopii',
    title: 'Codziennie na serwerze',
    text: 'Każdego dnia kopiujemy pliki, bazy danych i pocztę. Trzymamy 7 ostatnich kopii — na szybkie „cofnij” prosto z panelu.',
  },
  {
    tag: '30 dni',
    title: 'Poza serwerem, szyfrowana',
    text: 'Druga kopia, z każdego z ostatnich 30 dni, leży poza serwerem i jest zaszyfrowana. Awaria serwera jej nie dotyka.',
  },
  {
    tag: 'domyślnie włączona',
    title: 'Kopia przed przywróceniem',
    text: 'Zanim cokolwiek nadpiszemy, zapisujemy stan obecny. Nieudane przywrócenie też da się cofnąć.',
  },
];

const KROKI: Step[] = [
  { label: '01', title: 'Wybierz kopię', text: 'W panelu widzisz listę kopii z datami. Wybierasz tę sprzed problemu.' },
  { label: '02', title: 'Zaznacz, co cofnąć', text: 'Same pliki, same bazy danych, pocztę albo wszystko naraz. Reszta zostaje nietknięta.' },
  { label: '03', title: 'Potwierdź nazwą domeny', text: 'Wpisujesz nazwę domeny, żeby nikt nie przywrócił kopii przez pomyłkę.' },
  { label: '04', title: 'Gotowe', text: 'Postęp widzisz w panelu. Po zakończeniu strona jest taka jak w dniu wybranej kopii.' },
];

const SYTUACJE: [string, string][] = [
  ['Wtyczka rozłożyła WordPressa', 'Cofasz same pliki do wczoraj, a baza z nowymi zamówieniami zostaje.'],
  ['Ktoś skasował ważne maile', 'Przywracasz samą pocztę. Pliki strony i bazy danych zostają bez zmian.'],
  ['Włamanie przez stary motyw', 'Wracasz do wersji sprzed ataku i od razu aktualizujesz motyw.'],
  [
    'Zniknął jeden plik',
    'Przeglądasz zawartość kopii i odtwarzasz wybrany plik albo katalog do osobnego folderu — nic na koncie nie zostaje nadpisane.',
  ],
];

const FAQ: [string, string][] = [
  [
    'Jak często robicie kopię strony?',
    'Codziennie. Na serwerze trzymamy 7 ostatnich kopii, a poza serwerem szyfrowaną kopię z każdego z ostatnich 30 dni.',
  ],
  [
    'Czy przywrócenie kopii kosztuje?',
    'Nie. Z kopii na serwerze przywracasz sam z panelu, ile razy chcesz, bez opłat i bez zgłoszeń.',
  ],
  ['Czy mogę przywrócić tylko bazę danych?', 'Tak. Wybierasz zakres: pliki, bazy danych, poczta albo wszystko naraz.'],
  [
    'Jak skorzystać z kopii sprzed ponad tygodnia?',
    'Kopię spoza serwera z wybranego dnia pobierasz w panelu na swoje konto. Pliki z niej możesz pobrać sam, a przywrócenie całego konta z takiej kopii wykonuje nasza obsługa po zgłoszeniu.',
  ],
];

export default function Page() {
  return (
    <main>
      <JsonLd
        data={howToSchema({
          name: 'Jak przywrócić stronę z kopii zapasowej w Verris',
          description: 'Przywracanie plików, baz danych i poczty z kopii na serwerze — samodzielnie w panelu Verris.',
          path: '/funkcje/kopie-zapasowe',
          steps: KROKI.map((k) => ({ name: k.title, text: String(k.text) })),
        })}
      />
      <JsonLd data={faqSchema(FAQ)} />

      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap hero2-grid">
          <div>
            <Breadcrumbs items={[{ label: 'Funkcje', href: '/funkcje' }, { label: 'Kopie zapasowe' }]} />
            <p className="kicker" style={{ marginTop: 18 }}>
              Kopie zapasowe
            </p>
            <h1>Zepsuta aktualizacja? Cofnij stronę do wczoraj</h1>
            <p className="lead">
              Każdy kiedyś kliknął „aktualizuj” i zobaczył biały ekran. Z Verris wracasz do działającej wersji sam, z
              panelu — bez zgłoszenia i bez czekania na kogokolwiek.
            </p>
            <div className="hero2-cta">
              <Button href={ZAMOW} cta="subhero">
                Zamów hosting
              </Button>
              <Button href="/specyfikacja" variant="ghost" cta="subhero-alt">
                Pełna specyfikacja
              </Button>
            </div>
          </div>
          <Card className="c-prev">
            <div className="c-prev-h">
              <span>Przywracanie — podgląd</span>
              <span>ilustracja</span>
            </div>
            <div className="c-prev-b">
              <div className="c-row on">
                <b>Wczoraj</b>
                <small>kopia na serwerze</small>
              </div>
              <div className="c-row">
                <b>7 dni wstecz</b>
                <small>kopia na serwerze</small>
              </div>
              <div className="c-row">
                <b>30 dni wstecz</b>
                <small>poza serwerem, szyfrowana</small>
              </div>
              <div className="c-pills">
                <span className="chip chip-sm">pliki</span>
                <span className="chip chip-sm">bazy</span>
                <span className="chip chip-sm">poczta</span>
              </div>
              <p className="c-note">
                Przed przywróceniem robimy kopię obecnego stanu — jeśli coś pójdzie nie tak, możesz wrócić.
              </p>
            </div>
          </Card>
        </div>
      </section>

      <section className="sec" aria-labelledby="k-warstwy">
        <div className="wrap">
          <SectionHead id="k-warstwy" title="Dwie warstwy kopii, żeby zawsze było do czego wrócić" />
          <div className="grid3">
            {WARSTWY.map((w) => (
              <Card key={w.title}>
                <span className="c-tag">{w.tag}</span>
                <h3>{w.title}</h3>
                <p>{w.text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-alt" aria-labelledby="k-jak">
        <div className="wrap">
          <SectionHead id="k-jak" title="Jak przywrócić stronę" />
          <Steps items={KROKI} variant="lista" />
        </div>
      </section>

      <section className="sec" aria-labelledby="k-kiedy">
        <div className="wrap">
          <SectionHead id="k-kiedy" title="Kiedy kopie ratują dzień" />
          <div className="duo">
            {SYTUACJE.map(([t, p]) => (
              <Card key={t}>
                <h3>{t}</h3>
                <p>{p}</p>
              </Card>
            ))}
          </div>
          <p className="c-honest">
            Uczciwie: nasze kopie są pomocnicze (§10 ust. 5 regulaminu). Jeśli strona to Twój biznes, trzymaj też
            własną kopię najważniejszych danych.
          </p>
        </div>
      </section>

      <section className="sec sec-alt" aria-labelledby="k-faq">
        <div className="wrap c-narrow">
          <SectionHead id="k-faq" title="Pytania o kopie zapasowe" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
          <p className="c-note" style={{ marginTop: 18 }}>
            Zobacz też: <Link href="/funkcje">wszystkie funkcje</Link> · <Link href="/hosting/wordpress">hosting WordPress</Link>{' '}
            · <Link href="/specyfikacja">specyfikacja</Link>
          </p>
        </div>
      </section>

      <CTABand
        title="Śpij spokojnie, nawet po aktualizacji"
        text="Kopie z 30 dni i przywracanie z panelu są w cenie hostingu — 45 zł/mies albo 449 zł/rok brutto."
        secondary={{ label: 'Wszystkie funkcje', href: '/funkcje' }}
      />
    </main>
  );
}
