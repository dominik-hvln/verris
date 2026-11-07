import type { StronaWejscie } from '../model.ts';

/**
 * Sklep Pro pracowni ceramiki (firma i dane fikcyjne) – fikstura testów renderera: hero-mozaika (Pro),
 * katalog produktów (Product w pełnym SEO), warsztaty jako kroki, galeria-mozaika, kontakt z formularzem.
 */
export const PRZYKLAD_CERAMIKA: StronaWejscie = {
  wersjaModelu: 1,
  firma: {
    nazwa: 'Glina i Ogień',
    branza: 'pracownia ceramiki',
    opisKrotki: 'Pracownia ceramiki w Krakowie: ręcznie toczone naczynia użytkowe i warsztaty z koła garncarskiego dla początkujących.',
    typSchema: 'Store',
    adres: { ulica: 'ul. Przykładowa 12', kod: '30-000', miasto: 'Kraków' },
    telefon: '600 000 000',
    email: 'kontakt@przyklad.pl',
    godziny: [
      { dni: ['wt', 'sr', 'cz', 'pt'], od: '12:00', do: '19:00' },
      { dni: ['so'], od: '10:00', do: '15:00' },
    ],
  },
  seo: {
    tytul: 'Glina i Ogień – pracownia ceramiki w Krakowie',
    opis: 'Ręcznie toczone kubki, misy i talerze z krakowskiej pracowni. Warsztaty z koła garncarskiego dla początkujących.',
    slowaKluczowe: ['ceramika Kraków', 'warsztaty ceramiczne Kraków', 'ceramika użytkowa'],
  },
  motyw: {
    styl: 'rzemieslniczy',
    paleta: {
      tlo: '#F4EEE6', powierzchnia: '#EADFD2', tekst: '#2A1F1A', tekstPrzygaszony: '#5E4F45', akcent: '#A84B26',
      naAkcencie: '#FFF8F0', akcentTekst: '#963F1E', linia: '#D8C8B6', ciemne: '#2A1F1A', naCiemnym: '#F4EEE6',
    },
    fonty: { naglowki: 'DM Serif Display', tekst: 'DM Sans' },
    zaokraglenie: 'lekkie',
    gestosc: 'normalna',
    skalaTypografii: 'wyrazista',
    animacje: 'subtelne',
    efekty: ['przyklejony-naglowek', 'pojawianie', 'lightbox', 'karuzela', 'tasma', 'mikrointerakcje'],
  },
  strony: [
    {
      slug: '',
      tytul: 'Start',
      sekcje: [
        {
          id: 'start', typ: 'hero', wariant: 'hero-mozaika',
          dane: {
            nadtytul: 'Pracownia ceramiki · Kraków',
            naglowek: 'Naczynia, które powstają powoli.',
            wyroznienie: 'powstają powoli.',
            podtytul: 'Toczymy kubki, misy i talerze w krótkich seriach. Każde naczynie jest trochę inne – tak jak ręka, która je zrobiła.',
            przyciski: [
              { etykieta: 'Zobacz naczynia', cel: '#sklep', styl: 'glowny' },
              { etykieta: 'Warsztaty', cel: '#warsztaty', styl: 'drugi' },
            ],
            obraz: { alt: 'Dłonie formujące misę na kole garncarskim', podpis: 'Zdjęcie: praca przy kole', opisDoWyszukania: 'pottery wheel hands clay bowl', proporcje: '4:5' },
          },
        },
        {
          id: 'sklep', typ: 'produkty', wariant: 'produkty-siatka', wMenu: 'Sklep',
          dane: {
            naglowek: 'Naczynia z ostatniego wypału',
            wstep: 'Krótkie serie – gdy coś się skończy, wraca po kolejnym wypale.',
            produkty: [
              { nazwa: 'Kubek poranny – szkliwo piaskowe', opis: 'Pojemność około 300 ml, wygodne ucho na cztery palce.', cenaBrutto: 89, sku: 'GO-KUB-01' },
              { nazwa: 'Misa do sałatek – grafit', opis: 'Szeroka misa na wspólny stół, matowe szkliwo grafitowe.', cenaBrutto: 189, sku: 'GO-MIS-02' },
              { nazwa: 'Talerze płytkie – komplet 2 szt.', opis: 'Średnica około 26 cm, brzeg bez szkliwa.', cenaBrutto: 159, dostepnosc: 'ostatnie', sku: 'GO-TAL-03' },
              { nazwa: 'Wazon walcowy', opis: 'Toczony na zamówienie w wybranym kolorze szkliwa.', cenaBrutto: 139, dostepnosc: 'na-zamowienie', sku: 'GO-WAZ-04' },
              { nazwa: 'Dzbanek na mleko', opis: 'Mały dzbanek z dzióbkiem, który nie kapie.', cenaBrutto: 119, dostepnosc: 'niedostepny', sku: 'GO-DZB-05' },
              { nazwa: 'Miseczki do przypraw – komplet 3 szt.', opis: 'Trzy małe miseczki w różnych odcieniach szkliwa.', cenaBrutto: 99, sku: 'GO-MSC-06' },
            ],
          },
        },
        {
          id: 'pracownia', typ: 'onas', wariant: 'onas-obraz-tekst', wMenu: 'Pracownia',
          dane: {
            naglowek: 'Mała pracownia, jeden piec i dużo cierpliwości.',
            akapity: [
              'Glina i Ogień to pracownia na parterze starej kamienicy. Toczymy, suszymy i wypalamy na miejscu, więc każde naczynie przechodzi przez nasze ręce kilka razy.',
              'Robimy rzeczy do codziennego używania: mają być wygodne, mieścić się w zmywarce i dobrze wyglądać na zwykłym stole.',
            ],
            obraz: { alt: 'Półki z naczyniami czekającymi na wypał', podpis: 'Zdjęcie: półki w pracowni', proporcje: '4:5' },
            wyrozniki: [
              { tytul: 'Toczone ręcznie', opis: 'Każde naczynie powstaje na kole, nie w formie.' },
              { tytul: 'Szkliwa do jedzenia', opis: 'Używamy szkliw przeznaczonych do kontaktu z żywnością.' },
              { tytul: 'Krótkie serie', opis: 'Kilka sztuk każdego wzoru w jednym wypale.' },
            ],
          },
        },
        {
          id: 'warsztaty', typ: 'kroki', wariant: 'kroki-kolumny', wMenu: 'Warsztaty',
          dane: {
            naglowek: 'Warsztaty z koła garncarskiego',
            wstep: 'Dla początkujących, w małych grupach. Glina, szkliwa i wypał są w cenie.',
            kroki: [
              { tytul: 'Toczenie', opis: 'Uczysz się centrować glinę i toczysz pierwsze naczynia.', czas: '3 godziny' },
              { tytul: 'Szkliwienie', opis: 'Po wysuszeniu wracasz, żeby wybrać kolor i pomalować naczynia.', czas: 'po tygodniu' },
              { tytul: 'Odbiór', opis: 'Po wypale odbierasz gotowe naczynia z pracowni.', czas: 'po dwóch tygodniach' },
            ],
          },
        },
        {
          id: 'galeria', typ: 'galeria', wariant: 'galeria-mozaika', wMenu: 'Galeria',
          dane: {
            naglowek: 'Z pracowni',
            wstep: 'Wypały, szkliwa i stół, na którym wszystko się zaczyna.',
            obrazy: [
              { alt: 'Rząd kubków przed wypałem', podpis: 'Zdjęcie: kubki przed wypałem' },
              { alt: 'Próbki szkliw na płytkach', podpis: 'Zdjęcie: próbki szkliw' },
              { alt: 'Koło garncarskie w pracowni', podpis: 'Zdjęcie: koło garncarskie' },
              { alt: 'Misy suszące się na półce', podpis: 'Zdjęcie: suszenie misy' },
              { alt: 'Otwarty piec po wypale', podpis: 'Zdjęcie: piec po wypale' },
              { alt: 'Nakryty stół z naczyniami z pracowni', podpis: 'Zdjęcie: nakryty stół' },
            ],
          },
        },
        {
          id: 'kontakt', typ: 'kontakt', wariant: 'kontakt-podzielony', wMenu: 'Kontakt',
          dane: {
            naglowek: 'Odwiedź pracownię albo napisz',
            wstep: 'Zamówienia odbierzesz w pracowni albo wyślemy je kurierem. Na warsztaty zapisujemy mailowo i telefonicznie.',
            pola: ['imie', 'email', 'telefon', 'wiadomosc'],
          },
        },
      ],
    },
  ],
  stopka: { politykaPrywatnosci: '/polityka-prywatnosci', regulamin: '/regulamin', znakKreatora: 'minimalny' },
};
