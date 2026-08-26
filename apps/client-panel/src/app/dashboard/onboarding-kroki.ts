import type { OnboardingSnapshot } from './onboarding-data';

/**
 * PANEL-01 — kroki onboardingu jako dane, nie JSX.
 *
 * DLACZEGO TO JEST OSOBNY PLIK. Logika siedziała w `onboarding-wizard.tsx`
 * wymieszana z ikonami i klasami CSS, więc nie dało się jej wykonać w teście —
 * a `onboarding-data.ts` ciągnie `listServices`, czyli warstwę sieciową. Tutaj
 * nie ma ani jednego importu poza typem (kasowanym przy kompilacji), więc
 * strażnik wykonuje ten kod, zamiast czytać źródło. Lekcja z `X-40`.
 *
 * DLACZEGO `stan`, A NIE `done: boolean`. Poprzednia wersja miała pole
 * `done: boolean`, a kroki „Postaw stronę" i „Poczta" dostawały na sztywno
 * `false` — bo nie mamy dla nich żadnej detekcji. Klient, który skonfigurował
 * wszystko poprawnie, widział „2/4 gotowe"; przy produkcie pocztowym „1/2".
 * Licznik nie mógł dojść do końca z definicji.
 *
 * Typ dwustanowy nie umie powiedzieć „nie wiem", więc brak wiedzy zapisywał
 * się jako „nie zrobione". To ta sama wada co w `X-39`, gdzie dashboard
 * pokazywał zero tam, gdzie nie miał danych. Trzeci stan usuwa przyczynę,
 * zamiast poprawiać objaw.
 */
export type StanKroku = 'zrobione' | 'niezrobione' | 'nieznane';

export interface KrokOnboardingu {
  klucz: string;
  tytul: string;
  opis: string;
  stan: StanKroku;
  href: string;
  cta: string;
}

export interface PodsumowanieKrokow {
  /** Kroki ze stanem `zrobione`. */
  zrobione: number;
  /** Kroki, dla których w ogóle mamy detekcję — mianownik licznika. */
  sprawdzane: number;
  /** Kroki bez detekcji. Nie wchodzą do licznika i nie udają niezrobionych. */
  nieznane: number;
}

/** `true`/`false` z health usługi; `null`/`undefined` znaczy „nie wiemy". */
function zeSprawdzenia(wynik: boolean | null | undefined): StanKroku {
  if (wynik === true) return 'zrobione';
  if (wynik === false) return 'niezrobione';
  return 'nieznane';
}

export function zbudujKroki(snapshot: OnboardingSnapshot): KrokOnboardingu[] {
  if (!snapshot.hasService) return [];

  const sid = snapshot.serviceId;
  const q = sid ? `?serviceId=${sid}` : '';

  if (snapshot.provisioning) {
    return [
      {
        klucz: 'provisioning',
        tytul: 'Trwa zakładanie konta',
        opis: 'Konfigurujemy Twoje konto na serwerze — to zwykle minuta. Odśwież stronę usługi.',
        // Krok informacyjny, nie zadanie dla klienta: nie ma czego odhaczyć.
        stan: 'nieznane',
        href: sid ? `/dashboard/services/${sid}` : '/dashboard/services',
        cta: 'Zobacz status',
      },
    ];
  }

  if (snapshot.isEmailProduct) {
    return [
      {
        klucz: 'mail',
        tytul: 'Utwórz skrzynki e-mail',
        opis: 'Dodaj skrzynki na swojej domenie i zaloguj się do webmaila.',
        // Brak detekcji: API nie zwraca liczby skrzynek w health usługi.
        stan: 'nieznane',
        href: `/dashboard/email${q}`,
        cta: 'Skrzynki',
      },
      {
        klucz: 'dns',
        tytul: 'Skieruj rekordy MX/DNS',
        opis: 'Upewnij się, że domena kieruje pocztę na nasz serwer.',
        stan: zeSprawdzenia(snapshot.dnsOk),
        href: `/dashboard/dns${q}`,
        cta: 'DNS',
      },
    ];
  }

  return [
    {
      klucz: 'site',
      tytul: 'Postaw stronę',
      opis: 'Przenieś stronę od konkurencji albo zainstaluj WordPress / aplikację 1-click.',
      // Brak detekcji: nie sprawdzamy zawartości katalogu domeny.
      stan: 'nieznane',
      href: `/dashboard/apps${q}`,
      cta: 'Aplikacje 1-click',
    },
    {
      klucz: 'dns',
      tytul: 'Skieruj domenę',
      opis: 'Wskaż domenę na nasz serwer (rekordy A/NS).',
      stan: zeSprawdzenia(snapshot.dnsOk),
      href: `/dashboard/dns${q}`,
      cta: 'DNS',
    },
    {
      klucz: 'ssl',
      tytul: 'Włącz SSL',
      opis: 'Darmowy certyfikat Let’s Encrypt dla bezpiecznego HTTPS.',
      stan: zeSprawdzenia(snapshot.tlsOk),
      href: `/dashboard/ssl${q}`,
      cta: 'SSL',
    },
    {
      klucz: 'mail',
      tytul: 'Skonfiguruj pocztę',
      opis: 'Utwórz skrzynki e-mail na swojej domenie.',
      stan: 'nieznane',
      href: `/dashboard/email${q}`,
      cta: 'Poczta',
    },
  ];
}

export function podsumujKroki(kroki: KrokOnboardingu[]): PodsumowanieKrokow {
  const zrobione = kroki.filter((k) => k.stan === 'zrobione').length;
  const nieznane = kroki.filter((k) => k.stan === 'nieznane').length;
  return { zrobione, sprawdzane: kroki.length - nieznane, nieznane };
}

/**
 * Podtytuł banera. Licznik pojawia się WYŁĄCZNIE wtedy, gdy jest co liczyć,
 * i liczy tylko kroki, które umiemy sprawdzić. Ułamek, który nie może dojść
 * do mianownika, jest gorszy niż brak ułamka.
 */
export function podtytulKrokow(p: PodsumowanieKrokow): string {
  if (p.sprawdzane === 0) return 'Skonfiguruj usługę w kilka chwil.';
  return `Skonfiguruj usługę w kilka chwil (sprawdzone automatycznie: ${p.zrobione}/${p.sprawdzane}).`;
}
