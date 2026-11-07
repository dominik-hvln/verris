import type { StronaWejscie } from '../model.ts';

/** Przykład z makiety (firma i dane fikcyjne) – fikstura testów renderera i planów. */
export const PRZYKLAD_SALON: StronaWejscie = {
  wersjaModelu: 1,
  firma: {
    nazwa: 'Pracownia Fal',
    branza: 'salon fryzjerski',
    opisKrotki: 'Kameralny salon fryzjerski na Jeżycach: strzyżenie, koloryzacja i pielęgnacja.',
    typSchema: 'HairSalon',
    adres: { ulica: 'ul. Przykładowa 12', kod: '60-000', miasto: 'Poznań' },
    telefon: '600 000 000',
    email: 'kontakt@przyklad.pl',
    godziny: [
      { dni: ['pn', 'wt', 'sr', 'cz', 'pt'], od: '09:00', do: '20:00' },
      { dni: ['so'], od: '09:00', do: '15:00' },
    ],
  },
  seo: {
    tytul: 'Pracownia Fal – salon fryzjerski Poznań Jeżyce',
    opis: 'Strzyżenie, koloryzacja i pielęgnacja włosów na Jeżycach. Umów wizytę online lub telefonicznie.',
    slowaKluczowe: ['fryzjer Poznań', 'fryzjer Jeżyce', 'koloryzacja Poznań'],
  },
  motyw: {
    styl: 'cieply-nowoczesny',
    paleta: {
      tlo: '#F6F0E8', powierzchnia: '#EDE4D8', tekst: '#1F2420', tekstPrzygaszony: '#544C43', akcent: '#1E4636',
      naAkcencie: '#F6F0E8', akcentTekst: '#9C4026', linia: '#D9CCBA', ciemne: '#1E4636', naCiemnym: '#F6F0E8',
    },
    fonty: { naglowki: 'Fraunces', tekst: 'Inter' },
    zaokraglenie: 'pelne',
    animacje: 'wyraziste',
    efekty: ['przyklejony-naglowek', 'pojawianie', 'lightbox', 'pasek-cta-mobile'],
  },
  strony: [
    {
      slug: '',
      tytul: 'Start',
      sekcje: [
        {
          id: 'start', typ: 'hero', wariant: 'hero-podzielony',
          dane: {
            nadtytul: 'Salon fryzjerski · Poznań, Jeżyce',
            naglowek: 'Dobre cięcie zaczyna się od rozmowy.',
            wyroznienie: 'rozmowy.',
            podtytul: 'Strzyżemy, koloryzujemy i pielęgnujemy włosy – każdą wizytę zaczynamy od krótkiej konsultacji i ustalenia ceny.',
            przyciski: [{ etykieta: 'Umów wizytę', cel: '#kontakt', styl: 'glowny' }, { etykieta: 'Usługi i ceny', cel: '#uslugi', styl: 'drugi' }],
            obraz: { alt: 'Wnętrze salonu', podpis: 'Zdjęcie: wnętrze salonu', opisDoWyszukania: 'hair salon interior warm light', proporcje: '4:5' },
          },
        },
        {
          id: 'uslugi', typ: 'oferta', wariant: 'oferta-lista-cen', wMenu: 'Usługi i ceny',
          dane: {
            naglowek: 'Cenę znasz, zanim usiądziesz w fotelu.',
            pozycje: [
              { tytul: 'Strzyżenie damskie – włosy krótkie', cena: 'od 110 zł' },
              { tytul: 'Strzyżenie męskie', cena: 'od 70 zł' },
              { tytul: 'Koloryzacja – jeden kolor', cena: 'od 190 zł' },
            ],
          },
        },
        {
          id: 'galeria', typ: 'galeria', wariant: 'galeria-karuzela', wMenu: 'Galeria',
          dane: { naglowek: 'Zajrzyj do środka.', obrazy: [{ alt: 'Stanowisko', podpis: 'Zdjęcie: stanowisko' }, { alt: 'Recepcja', podpis: 'Zdjęcie: recepcja' }] },
        },
        { id: 'opinie', typ: 'opinie', wariant: 'opinie-cytat', dane: { naglowek: 'Co mówią o nas klienci' } },
        {
          id: 'pytania', typ: 'faq', wariant: 'faq-akordeon',
          dane: { naglowek: 'Pytania', pytania: [{ pytanie: 'Czy trzeba się umawiać?', odpowiedz: 'Tak, najlepiej telefonicznie albo przez formularz.' }] },
        },
        { id: 'kontakt', typ: 'kontakt', wariant: 'kontakt-podzielony', wMenu: 'Kontakt', dane: { naglowek: 'Umów wizytę', pola: ['imie', 'telefon', 'usluga', 'termin'] } },
      ],
    },
  ],
  stopka: { politykaPrywatnosci: '/polityka-prywatnosci', znakKreatora: 'minimalny' },
};
