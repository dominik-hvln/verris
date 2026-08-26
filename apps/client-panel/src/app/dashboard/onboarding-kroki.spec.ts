import { podsumujKroki, podtytulKrokow, zbudujKroki } from './onboarding-kroki';

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
    const kroki = zbudujKroki({ ...HOSTING, dnsOk: true, tlsOk: true });
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
