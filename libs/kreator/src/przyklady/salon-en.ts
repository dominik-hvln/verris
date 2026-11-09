import type { StronaWejscie } from '../model.ts';
import { PRZYKLAD_SALON } from './salon.ts';

/** Kopia JSON (moduł ładuje się też w środowiskach testów bez structuredClone, np. jsdom). */
const kopia = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * Przykład salonu z wersją angielską (paczka 124) – tłumaczenie wpisane ręcznie, firma i dane fikcyjne. Fikstura
 * testów wersji językowych (hreflang, przełącznik, sitemap) i zrzutów nagłówka. Skrót `tlumaczenie.zrodlo` celowo
 * nieaktualny („0…”) – testy edytora sprawdzają oznaczenie nieaktualnego tłumaczenia.
 */
export const PRZYKLAD_SALON_EN: StronaWejscie = {
  ...kopia(PRZYKLAD_SALON),
  jezykiDodatkowe: ['en'],
  strony: [
    ...kopia(PRZYKLAD_SALON.strony),
    {
      slug: 'en',
      jezyk: 'en',
      klucz: '',
      tytul: 'Home',
      seo: {
        tytul: 'Pracownia Fal – hair salon in Poznan, Jezyce',
        opis: 'Haircuts, colouring and hair care in Jezyce, Poznan. Book a visit by phone or online.',
      },
      tlumaczenie: { zrodlo: '0000000000000000' },
      sekcje: [
        {
          id: 'start', typ: 'hero', wariant: 'hero-podzielony',
          dane: {
            nadtytul: 'Hair salon · Poznan, Jezyce',
            naglowek: 'A good haircut starts with a conversation.',
            wyroznienie: 'conversation.',
            podtytul: 'We cut, colour and care for your hair – every visit starts with a short consultation and an agreed price.',
            przyciski: [{ etykieta: 'Book a visit', cel: '#kontakt', styl: 'glowny' }, { etykieta: 'Services and prices', cel: '#uslugi', styl: 'drugi' }],
            obraz: { alt: 'Salon interior', podpis: 'Photo: salon interior', opisDoWyszukania: 'hair salon interior warm light', proporcje: '4:5' },
          },
        },
        {
          id: 'uslugi', typ: 'oferta', wariant: 'oferta-lista-cen', wMenu: 'Services and prices',
          dane: {
            naglowek: 'You know the price before you sit in the chair.',
            pozycje: [
              { tytul: 'Women’s haircut – short hair', cena: 'from 110 PLN' },
              { tytul: 'Men’s haircut', cena: 'from 70 PLN' },
              { tytul: 'Colouring – single colour', cena: 'from 190 PLN' },
            ],
          },
        },
        {
          id: 'galeria', typ: 'galeria', wariant: 'galeria-karuzela', wMenu: 'Gallery',
          dane: { naglowek: 'Take a look inside.', obrazy: [{ alt: 'Styling station', podpis: 'Photo: styling station' }, { alt: 'Reception', podpis: 'Photo: reception' }] },
        },
        { id: 'opinie', typ: 'opinie', wariant: 'opinie-cytat', dane: { naglowek: 'What our clients say' } },
        {
          id: 'pytania', typ: 'faq', wariant: 'faq-akordeon',
          dane: { naglowek: 'Questions', pytania: [{ pytanie: 'Do I need an appointment?', odpowiedz: 'Yes, ideally by phone or through the form.' }] },
        },
        { id: 'kontakt', typ: 'kontakt', wariant: 'kontakt-podzielony', wMenu: 'Contact', dane: { naglowek: 'Book a visit', pola: ['imie', 'telefon', 'usluga', 'termin'] } },
      ],
    },
  ],
  stopka: { ...kopia(PRZYKLAD_SALON.stopka), tlumaczenia: { en: { tekst: 'An intimate hair salon in Jezyce, Poznan: haircuts, colouring and hair care.' } } },
};
