import { fakturaKompletna, najnizszyPostep, podsumujKroki, podtytulKrokow, uslugiOnboardingu, zbudujKroki } from './onboarding-kroki';
import type { ServiceSummaryDto } from '@verris/contracts';

/**
 * PANEL-01 — strażnik licznika onboardingu.
 *
 * CO PILNUJE. Przed poprawką kroki „Postaw stronę" i „Poczta" miały `done`
 * zahardkodowane na `false`, więc licznik pokazywał najwyżej 2/4 (hosting)
 * albo 1/2 (poczta) — także klientowi, który skonfigurował wszystko. Ten plik
 * pilnuje jednej własności: **mianownik zawiera wyłącznie kroki, które umiemy
 * sprawdzić**, więc licznik zawsze da się doprowadzić do końca.
 *
 * DLACZEGO NIE SPRAWDZAM TU TREŚCI. Tytuły i opisy zmienią się przy `PROD-02`.
 * Strażnik trzymający się treści zapaliłby się przy pierwszej zmianie tekstu
 * i nauczyłby nas go ignorować.
 */

const HOSTING = {
  hasService: true,
  serviceId: 'srv-1',
  domain: 'example.pl',
  isEmailProduct: false,
  provisioning: false,
  dnsOk: null as boolean | null,
  tlsOk: null as boolean | null,
};

const POCZTA = { ...HOSTING, isEmailProduct: true };

describe('PANEL-01 — licznik onboardingu', () => {
  it('licznik hostingu da się doprowadzić do końca', () => {
    const p = podsumujKroki(zbudujKroki({ ...HOSTING, dnsOk: true, tlsOk: true }));
    expect(p.sprawdzane).toBeGreaterThan(0);
    // Sedno całej poprawki: przed nią było 2 z 4 przy komplecie.
    expect(p.zrobione).toBe(p.sprawdzane);
  });

  it('licznik poczty da się doprowadzić do końca', () => {
    const p = podsumujKroki(zbudujKroki({ ...POCZTA, dnsOk: true }));
    expect(p.sprawdzane).toBeGreaterThan(0);
    expect(p.zrobione).toBe(p.sprawdzane);
  });

  it('kroki bez detekcji nie wchodzą do mianownika', () => {
    const kroki = zbudujKroki({ ...HOSTING, dnsOk: true, tlsOk: true, platnoscOk: true, fakturaOk: true });
    const p = podsumujKroki(kroki);
    const bezDetekcji = kroki.filter((k) => k.stan === 'nieznane').map((k) => k.klucz);
    expect(bezDetekcji).toEqual(['site', 'mail']);
    expect(p.nieznane).toBe(2);
    expect(p.sprawdzane).toBe(kroki.length - p.nieznane);
  });

  it('„nie wiemy" nie jest tym samym co „nie zrobione"', () => {
    const brak = zbudujKroki({ ...HOSTING, dnsOk: null, tlsOk: null });
    const nie = zbudujKroki({ ...HOSTING, dnsOk: false, tlsOk: false });

    expect(brak.find((k) => k.klucz === 'dns')?.stan).toBe('nieznane');
    expect(nie.find((k) => k.klucz === 'dns')?.stan).toBe('niezrobione');

    // Brak danych nie może powiększać mianownika — inaczej awaria health
    // usługi obniżałaby klientowi postęp bez żadnej jego winy.
    expect(podsumujKroki(brak).sprawdzane).toBe(0);
    expect(podsumujKroki(nie).sprawdzane).toBe(2);
  });

  it('podtytuł nie pokazuje ułamka, gdy nie ma czego liczyć', () => {
    const provisioning = podtytulKrokow(podsumujKroki(zbudujKroki({ ...HOSTING, provisioning: true })));
    expect(provisioning).not.toMatch(/\d+\s*\/\s*\d+/);

    const komplet = podtytulKrokow(podsumujKroki(zbudujKroki({ ...HOSTING, dnsOk: true, tlsOk: true })));
    expect(komplet).toMatch(/2\/2/);
  });

  it('brak usługi nie generuje kroków', () => {
    expect(zbudujKroki({ ...HOSTING, hasService: false })).toEqual([]);
  });

  it('każdy krok ma jeden z trzech dozwolonych stanów i cel', () => {
    const wszystkie = [
      ...zbudujKroki({ ...HOSTING, dnsOk: true, tlsOk: false }),
      ...zbudujKroki({ ...POCZTA, dnsOk: false }),
      ...zbudujKroki({ ...HOSTING, provisioning: true }),
    ];
    expect(wszystkie.length).toBeGreaterThan(0);
    for (const k of wszystkie) {
      expect(['zrobione', 'niezrobione', 'nieznane']).toContain(k.stan);
      expect(k.href.startsWith('/dashboard')).toBe(true);
      expect(k.klucz).not.toHaveLength(0);
    }
  });

  it('kontrola strażnika — wykrywa krok bez detekcji wliczony do mianownika', () => {
    // Spreparowany zestaw udający starą wadę: krok bez detekcji zapisany jako
    // `niezrobione`. Gdyby ta asercja nie zapalała się na takim wejściu,
    // strażnik nie pilnowałby niczego.
    const zepsute = zbudujKroki({ ...HOSTING, dnsOk: true, tlsOk: true }).map((k) =>
      k.klucz === 'site' ? { ...k, stan: 'niezrobione' as const } : k,
    );
    const p = podsumujKroki(zepsute);
    expect(p.zrobione).not.toBe(p.sprawdzane);
  });
});

describe('PROD-02 — pasek postępu w sidebarze', () => {
  const usluga = (id: string, dnsOk: boolean | null, tlsOk: boolean | null) => ({
    id,
    nazwa: `${id}.pl`,
    onboarding: { ...HOSTING, serviceId: id, dnsOk, tlsOk },
  });

  it('bierze usługę z NAJNIŻSZYM postępem, nie pierwszą z listy', () => {
    const p = najnizszyPostep([usluga('gotowa', true, true), usluga('nowa', false, false)]);
    expect(p?.usluga.id).toBe('nowa');
    expect(p?.procent).toBe(0);
  });

  it('komplet = 100, żeby pasek mógł zniknąć', () => {
    expect(najnizszyPostep([usluga('a', true, true)])?.procent).toBe(100);
  });

  it('usługa bez sprawdzalnych kroków (zakładanie) nie ciągnie paska w dół', () => {
    const zakladana = { ...usluga('z', null, null), onboarding: { ...HOSTING, provisioning: true } };
    expect(najnizszyPostep([zakladana, usluga('a', true, false)])?.usluga.id).toBe('a');
    expect(najnizszyPostep([zakladana])).toBeNull();
  });

  it('subkonto: kroki bez uprawnienia wypadają z licznika', () => {
    // Bez dostępu do SSL zostaje sam DNS — zrobiony, więc 100%, a nie 50% bez możliwości ruchu.
    const p = najnizszyPostep([usluga('a', true, false)], (href) => href !== '/dashboard/ssl');
    expect(p?.procent).toBe(100);
  });

  it('anulowane i wygasłe usługi nie mają czego konfigurować', () => {
    const s = (id: string, status: string) =>
      ({ id, status, planName: 'Plan', productKind: 'HOSTING', account: { domain: `${id}.pl` }, health: { checks: { dnsOk: false, tlsOk: false } } }) as unknown as ServiceSummaryDto;
    const u = uslugiOnboardingu([s('a', 'ACTIVE'), s('b', 'CANCELED'), s('c', 'EXPIRED')]);
    expect(u.map((x) => x.id)).toEqual(['a']);
    expect(u[0].onboarding.dnsOk).toBe(false);
  });
});

describe('PROD-02 — kroki płatność i faktura', () => {
  const usluga = (o: Partial<ServiceSummaryDto> = {}) =>
    ({ id: 's1', status: 'ACTIVE', planName: 'Start', priceAmount: '29.00', paymentSource: 'WALLET', productKind: 'HOSTING', account: null, health: null, ...o }) as unknown as ServiceSummaryDto;
  const stan = (u: ServiceSummaryDto, konto: Parameters<typeof uslugiOnboardingu>[1]) => {
    const kroki = zbudujKroki(uslugiOnboardingu([u], konto)[0].onboarding);
    return Object.fromEntries(kroki.map((k) => [k.klucz, k.stan]));
  };

  it('bez danych konta oba kroki są „nieznane”, nie „niezrobione”', () => {
    const s = stan(usluga(), null);
    expect(s.platnosc).toBe('nieznane');
    expect(s.faktura).toBe('nieznane');
  });

  it('płatność: karta, auto-doładowanie albo saldo na okres', () => {
    const konto = { saldo: 10, autoDoladowanie: false, fakturaOk: true };
    expect(stan(usluga(), konto).platnosc).toBe('niezrobione');
    expect(stan(usluga(), { ...konto, saldo: 29 }).platnosc).toBe('zrobione');
    expect(stan(usluga(), { ...konto, autoDoladowanie: true }).platnosc).toBe('zrobione');
    expect(stan(usluga({ paymentSource: 'STRIPE_CARD' }), konto).platnosc).toBe('zrobione');
    expect(stan(usluga({ paymentSource: 'MANUAL' }), konto).platnosc).toBe('nieznane');
  });

  it('faktura: osoba prywatna albo firma, zawsze z adresem', () => {
    const adres = { address: 'Polna 1', city: 'Kraków', postalCode: '30-001', country: 'PL' };
    const pusto = { companyName: null, nip: null, firstName: null, lastName: null };
    expect(fakturaKompletna({ ...pusto, firstName: 'Anna', lastName: 'Nowak', ...adres })).toBe(true);
    expect(fakturaKompletna({ ...pusto, nip: '5260250274', ...adres })).toBe(true);
    expect(fakturaKompletna({ ...pusto, firstName: 'Anna', lastName: 'Nowak', ...adres, city: ' ' })).toBe(false);
    expect(fakturaKompletna({ ...pusto, ...adres })).toBe(false);
  });
});
