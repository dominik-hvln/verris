// Treść stron funkcji (SEO). Jeden dynamiczny route /funkcje/[slug] renderuje poniższe.

export type FeatureCta = {
  title: string;
  text: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondary?: { label: string; href: string };
};

export type FeatureSection = { h?: string; p?: string[]; ul?: string[] };

export type Feature = {
  slug: string;
  eyebrow: string;
  title: string;
  lead: string;
  metaTitle: string;
  metaDescription: string;
  sections: FeatureSection[];
  cta: FeatureCta;
};

export const features: Feature[] = [
  {
    slug: 'autoskalowanie',
    eyebrow: 'Funkcja',
    title: 'Autoskalowanie zasobów',
    lead: 'Bazę masz w cenie, a nadwyżkę płacisz godzinowo — tylko za czas, w którym strona naprawdę potrzebuje więcej mocy.',
    metaTitle: 'Autoskalowanie hostingu — płać za realne użycie | Verris',
    metaDescription:
      'Jak działa autoskalowanie w Verris: baza 50 GB/8 GB/2 vCPU, skalowanie do 1000 GB, 64 GB RAM i 24 vCPU, tryb ECO i rozliczenie godzinowe. Płacisz za realne użycie, nie za pakiet na zapas.',
    sections: [
      {
        p: [
          'Sztywne pakiety zmuszają do wyboru mocy „na zapas". Verris rozlicza inaczej: masz konkretną bazę, a gdy ruch rośnie, silnik autoskalowania zwiększa zasoby i nalicza je godzinowo. Gdy ruch spada, tryb ECO zwalnia nadwyżkę i naliczanie się kończy.',
        ],
      },
      {
        h: 'Zakres skalowania',
        ul: [
          'Baza w cenie: 50 GB NVMe, 8 GB RAM, 2 vCPU (CloudLinux).',
          'Maksymalnie: 1000 GB dysku, 64 GB RAM, 24 vCPU — do 12× mocy CPU względem bazy.',
          'Krok skalowania dobierany automatycznie; tryb ECO zwalnia moc po piku.',
          'Rozliczenie godzinowe brutto — płacisz tylko za faktyczny czas nadwyżki.',
        ],
      },
      {
        h: 'Ile to kosztuje',
        p: [
          'Bazowe zasoby są w cenie pakietu (39 zł/mies lub 349 zł/rok brutto). Nadwyżka nalicza się godzinowo według stawek z cennika. Orientacyjny koszt policzysz w kalkulatorze autoskalowania na stronie migracji.',
        ],
      },
    ],
    cta: {
      title: 'Policz swój koszt autoskalowania',
      text: 'Ustaw suwaki zasobów i zobacz koszt godzinowy oraz maksymalny miesięczny.',
      primaryLabel: 'Otwórz kalkulator',
      primaryHref: '/przenies-strone#kalkulator',
      secondary: { label: 'Zobacz hosting', href: '/hosting' },
    },
  },
  {
    slug: 'migracja',
    eyebrow: 'Funkcja',
    title: 'Migracja strony i poczty za 0 zł',
    lead: 'Przeprowadzkę bierzemy na siebie. Zespół przenosi stronę i pocztę obok działającej witryny — bez przestoju i bez limitu plików.',
    metaTitle: 'Darmowa migracja strony i poczty na inny hosting | Verris',
    metaDescription:
      'Przeniesiemy Twoją stronę i pocztę za 0 zł — zespół albo migrator w panelu. Migracja obok działającej strony, bez przestoju, przełączenie przez DNS. Bez limitu plików i dopłat za bazy.',
    sections: [
      {
        p: [
          'Migracja odbywa się obok działającej strony: dane kopiujemy na nowy serwer, a obecna witryna działa u dotychczasowego dostawcy aż do przełączenia DNS. Propagacja DNS trwa zwykle od kilkunastu minut do kilku godzin.',
        ],
      },
      {
        h: 'Co przenosimy',
        ul: [
          'Pliki strony (w tym WordPress), bazy danych i konfigurację.',
          'Skrzynki e-mail wraz z wiadomościami.',
          'Bez limitu liczby plików i bez dopłat za bazy danych.',
        ],
      },
    ],
    cta: {
      title: 'Przenieś stronę bez stresu',
      text: 'Załóż konto, przekaż dostępy — resztą zajmiemy się my. Za 0 zł.',
      primaryLabel: 'Przejdź do migracji',
      primaryHref: '/przenies-strone',
      secondary: { label: 'Zobacz cennik', href: '/cennik' },
    },
  },
  {
    slug: 'ssl',
    eyebrow: 'Funkcja',
    title: 'Certyfikaty SSL w cenie',
    lead: 'Szyfrowanie HTTPS bez dopłat. Certyfikat Let’s Encrypt wystawiany i odnawiany automatycznie.',
    metaTitle: 'Darmowy certyfikat SSL Let’s Encrypt w hostingu | Verris',
    metaDescription:
      'Certyfikat SSL Let’s Encrypt w cenie hostingu Verris — bez dopłat przy odnowieniu. Szyfrowanie HTTPS dla strony, koszyka i płatności, wystawianie i odnawianie automatyczne.',
    sections: [
      {
        p: [
          'HTTPS to dziś standard — wpływa na zaufanie odwiedzających i na SEO. W Verris certyfikat Let’s Encrypt jest w cenie hostingu i nie pojawia się jako niespodzianka na fakturze odnowieniowej.',
        ],
      },
      {
        h: 'Co zyskujesz',
        ul: [
          'Szyfrowanie całej strony, formularzy i płatności.',
          'Automatyczne wystawianie i odnawianie certyfikatu.',
          'Brak dopłat przy odnowieniu — inaczej niż u części dostawców.',
        ],
      },
    ],
    cta: {
      title: 'Postaw stronę na HTTPS bez dopłat',
      text: 'SSL jest w cenie każdego pakietu hostingu Verris.',
      secondary: { label: 'Zobacz hosting', href: '/hosting' },
    },
  },
  {
    slug: 'kopie-zapasowe',
    eyebrow: 'Funkcja',
    title: 'Kopie zapasowe z odtwarzaniem',
    lead: 'Backup i przywracanie z poziomu DirectAdmin — samodzielnie, bez czekania na support i bez dopłat.',
    metaTitle: 'Kopie zapasowe i odtwarzanie w hostingu | Verris',
    metaDescription:
      'Kopie zapasowe z samodzielnym odtwarzaniem w panelu DirectAdmin. Przywróć pliki i bazę, gdy aktualizacja pójdzie nie tak — bez czekania na support i bez dopłat.',
    sections: [
      {
        p: [
          'Nieudana aktualizacja wtyczki albo błąd w konfiguracji nie muszą oznaczać paniki. W Verris przywrócisz pliki i bazę danych samodzielnie z poziomu DirectAdmin.',
        ],
      },
      {
        h: 'Jak to działa',
        ul: [
          'Kopie tworzone w ramach usługi hostingu.',
          'Samodzielne odtwarzanie w panelu — bez zgłoszenia do supportu.',
          'Opisujemy mechanizm wprost — bez obietnic „pełnego bezpieczeństwa".',
        ],
      },
    ],
    cta: {
      title: 'Miej plan B w zasięgu ręki',
      text: 'Kopie z odtwarzaniem są częścią hostingu Verris.',
      secondary: { label: 'Zobacz hosting', href: '/hosting' },
    },
  },
  {
    slug: 'analityka-bez-cookies',
    eyebrow: 'Funkcja',
    title: 'Prywatna analityka bez cookies',
    lead: 'Statystyki odwiedzin bez danych osobowych i bez banera zgód. Wiesz, co się dzieje na stronie — bez obciążania jej wtyczkami.',
    metaTitle: 'Analityka bez cookies — statystyki bez banera zgód | Verris',
    metaDescription:
      'Prywatna analityka odwiedzin w hostingu Verris: bez cookies i bez danych osobowych, więc działa bez banera zgód. Statystyki strony bez wpinania zewnętrznych skryptów.',
    sections: [
      {
        p: [
          'Większość hostingów każe wpinać zewnętrzną analitykę i pokazywać baner zgód. Verris daje prywatną analitykę odwiedzin, która nie zapisuje cookies ani danych osobowych — dzięki temu działa bez zgody i bez spowalniania strony.',
        ],
      },
      {
        h: 'Dlaczego to ważne',
        ul: [
          'Brak cookies i danych osobowych — mniej obowiązków RODO.',
          'Działa bez banera zgód i bez zewnętrznych skryptów.',
          'Podstawowe statystyki dostępne od pierwszego dnia.',
        ],
      },
    ],
    cta: {
      title: 'Mierz ruch bez kompromisów',
      text: 'Prywatna analityka jest wbudowana w hosting Verris.',
      secondary: { label: 'Zobacz hosting', href: '/hosting' },
    },
  },
  {
    slug: 'rodo-i-dpa',
    eyebrow: 'Funkcja',
    title: 'RODO, DPA i podprocesorzy',
    lead: 'Komplet dokumentów dostępny online: polityka prywatności, umowa powierzenia (DPA) do akceptacji w panelu i lista podprocesorów.',
    metaTitle: 'RODO i DPA w hostingu — dokumenty online | Verris',
    metaDescription:
      'Verris udostępnia komplet dokumentów RODO online: politykę prywatności, DPA (umowę powierzenia) do samodzielnej akceptacji w panelu oraz listę podprocesorów. Serwery w UE (EOG).',
    sections: [
      {
        p: [
          'Dla firmy hosting to także zgodność z RODO. Verris udostępnia dokumenty online, żebyś nie tracił godzin na papierologię: politykę prywatności, umowę powierzenia przetwarzania (DPA) do akceptacji w panelu oraz listę podprocesorów.',
        ],
      },
      {
        h: 'Co masz pod ręką',
        ul: [
          'DPA do samodzielnej akceptacji w panelu klienta.',
          'Aktualna lista podprocesorów.',
          'Infrastruktura w UE (Hetzner) — dane w EOG.',
        ],
      },
    ],
    cta: {
      title: 'Zgodność bez papierologii',
      text: 'Dokumenty RODO i DPA znajdziesz w panelu klienta.',
      primaryLabel: 'Dokumenty prawne',
      primaryHref: 'https://panel.verris.pl/legal',
      secondary: { label: 'Zobacz hosting', href: '/hosting' },
    },
  },
  {
    slug: 'sla',
    eyebrow: 'Funkcja',
    title: 'SLA 99,5% z rekompensatami',
    lead: 'Nie „obiecujemy" dostępności — gwarantujemy ją w umowie. Za niedostępność naliczamy kredyty według regulaminu.',
    metaTitle: 'SLA 99,5% z rekompensatami — gwarancja w umowie | Verris',
    metaDescription:
      'Verris gwarantuje SLA 99,5% z automatycznymi rekompensatami zapisanymi w regulaminie (kredyty zależne od skali niedostępności). Bez obietnic „100% uptime".',
    sections: [
      {
        p: [
          'Uczciwa gwarancja to taka, która ma pokrycie w umowie. Verris deklaruje SLA na poziomie 99,5% i — co ważniejsze — przewiduje rekompensaty za jego niedotrzymanie w postaci kredytów, których wysokość zależy od skali niedostępności.',
        ],
      },
      {
        h: 'Zasady wprost',
        ul: [
          'SLA 99,5% — realny poziom, nie marketingowe „100%".',
          'Rekompensaty = kredyty naliczane wg regulaminu.',
          'Status usług na żywo pod status.verris.pl.',
        ],
      },
    ],
    cta: {
      title: 'Sprawdź, jak stoją usługi',
      text: 'Aktualny status i historię incydentów zobaczysz na stronie statusu.',
      primaryLabel: 'Status usług',
      primaryHref: 'https://status.verris.pl',
      secondary: { label: 'Zobacz hosting', href: '/hosting' },
    },
  },
];

export const featureBySlug = (slug: string) => features.find((f) => f.slug === slug);
