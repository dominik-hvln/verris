import { Strona, walidujStrone, type StronaWejscie } from '../model.ts';
import { PRZYKLAD_CERAMIKA } from '../przyklady/ceramika.ts';
import { PRZYKLAD_KSIEGOWA } from '../przyklady/ksiegowa.ts';
import { PRZYKLAD_SALON } from '../przyklady/salon.ts';
import { PRZYKLAD_SALON_EN } from '../przyklady/salon-en.ts';
import { PRZYKLAD_STUDIO } from '../przyklady/studio.ts';
import { kompaktujSekcje, kompaktujStrone, uzupelnijSerwerowe } from './kompakt.ts';
import { blokMasterPromptu } from './master-prompt.ts';
import { odczytajWynikGeneracji, odczytajWynikZmiany } from './odczyt.ts';
import { opisModeluStrony } from './opis-schematu.ts';

/** Paczka 127 – zapis kompaktowy: odpowiedź bez pól domyślnych i bez wersjaModelu daje ten sam model co pełna. */
const PRZYKLADY: [string, StronaWejscie][] = [
  ['salon', PRZYKLAD_SALON],
  ['salon-en', PRZYKLAD_SALON_EN],
  ['ksiegowa', PRZYKLAD_KSIEGOWA],
  ['ceramika', PRZYKLAD_CERAMIKA],
  ['studio', PRZYKLAD_STUDIO],
];

function model(w: unknown): Strona {
  const r = walidujStrone(w);
  if (!r.ok) throw new Error(r.bledy.join('\n'));
  return r.strona;
}

describe('kompaktujStrone', () => {
  it.each(PRZYKLADY)('%s: Strona.parse(kompakt + serwer) = pełny model, a kompakt jest krótszy', (_n, p) => {
    const pelny = model(p);
    const k = kompaktujStrone(pelny);
    expect(Strona.parse(uzupelnijSerwerowe(k))).toEqual(pelny);
    expect(JSON.stringify(k).length).toBeLessThan(JSON.stringify(pelny).length);
  });

  it('pomija wartości domyślne schematu i wersjaModelu, zostawia wartości inne niż domyślne', () => {
    const pelny = model(PRZYKLAD_SALON);
    const t = JSON.stringify(kompaktujStrone(pelny));
    for (const domyslne of ['"wersjaModelu"', '"tlo":"domyslne"', '"ukryta":false', '"styl":"glowny"', '"zrodlo":"placeholder"', '"proporcje":"4:3"', '"jezyk":"pl"', '"jezykiDodatkowe":[]', '"fakty":[]', '"wpisy":[]', '"mapa":true', '"formularz":true']) {
      expect(t).not.toContain(domyslne);
    }
    expect(JSON.stringify(pelny)).toContain('"tlo":"domyslne"');
    // inne niż domyślne zostają
    expect(t).toContain('"styl":"drugi"');
    expect(t).toContain('"proporcje":"4:5"');
    expect(t).toContain('"pola":["imie","telefon","usluga","termin"]');
  });

  it('sekcja: kompakt sekcji wraca do tej samej sekcji po walidacji', () => {
    const s = model(PRZYKLAD_STUDIO);
    for (const sek of s.strony.flatMap((p) => p.sekcje)) {
      const w = odczytajWynikZmiany(s, JSON.stringify(kompaktujSekcje(sek)), sek.id, 'pro', s.strony.find((p) => p.sekcje.includes(sek))!.slug);
      if (!w.ok) throw new Error(w.bledy.join('\n'));
      expect(w.strona).toEqual(s);
    }
  });
});

describe('odczyt odpowiedzi w zapisie kompaktowym', () => {
  it.each(PRZYKLADY.filter(([n]) => n !== 'salon-en'))('%s: generacja bez pól domyślnych i bez wersjaModelu = ten sam model co pełna odpowiedź', (_n, p) => {
    const pelny = model(p);
    const zPelnej = odczytajWynikGeneracji(JSON.stringify(pelny), 'pro');
    const zKompaktu = odczytajWynikGeneracji(JSON.stringify(kompaktujStrone(pelny)), 'pro');
    if (!zPelnej.ok) throw new Error(zPelnej.bledy.join('\n'));
    if (!zKompaktu.ok) throw new Error(zKompaktu.bledy.join('\n'));
    expect(zKompaktu.strona).toEqual(zPelnej.strona);
  });

  it('pole strategia (plan przed treścią) jest usuwane, nie trafia do modelu', () => {
    const k = { strategia: { grupa: 'mieszkańcy Jeżyc', obietnica: 'cena przed strzyżeniem', przewagi: ['konsultacja'], ton: 'ciepły', dzialanie: 'telefon' }, ...(kompaktujStrone(model(PRZYKLAD_SALON)) as object) };
    const w = odczytajWynikGeneracji(JSON.stringify(k), 'pro');
    if (!w.ok) throw new Error(w.bledy.join('\n'));
    expect(w.strona).not.toHaveProperty('strategia');
    expect(w.strona.wersjaModelu).toBe(1);
  });

  it('master prompt mówi o zapisie kompaktowym i pokazuje wartości domyślne; wersjaModelu oznaczona jako pole serwera', () => {
    const b = blokMasterPromptu();
    expect(b).toContain('Zapis kompaktowy: bez wcięć');
    expect(b).toContain('Pomijaj pola z wartością domyślną');
    expect(opisModeluStrony()).toContain('wersjaModelu?: 1; // pomiń – uzupełnia serwer');
    expect(opisModeluStrony()).toContain('tlo?: \'domyslne\' | \'powierzchnia\' | \'ciemne\' | \'akcent\' = "domyslne"');
  });
});
