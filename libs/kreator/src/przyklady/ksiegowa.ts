import type { StronaWejscie } from '../model.ts';

/**
 * Landing biura rachunkowego (firma i dane fikcyjne) – fikstura testów renderera: hero z formularzem,
 * cennik z kwotami netto i brutto, FAQ (FAQPage w pełnym SEO), pas CTA na ciemnym tle.
 */
export const PRZYKLAD_KSIEGOWA: StronaWejscie = {
  wersjaModelu: 1,
  firma: {
    nazwa: 'Księgowa Pod Ręką',
    branza: 'biuro rachunkowe',
    opisKrotki: 'Biuro rachunkowe dla jednoosobowych działalności: księgowość, kadry i rozliczenia z urzędami bez papierologii.',
    typSchema: 'AccountingService',
    adres: { ulica: 'ul. Przykładowa 12', kod: '90-000', miasto: 'Łódź' },
    obszar: 'Cała Polska – współpraca zdalna',
    telefon: '600 000 000',
    email: 'kontakt@przyklad.pl',
    godziny: [{ dni: ['pn', 'wt', 'sr', 'cz', 'pt'], od: '08:00', do: '16:00' }],
  },
  seo: {
    tytul: 'Księgowa Pod Ręką – biuro rachunkowe dla JDG',
    opis: 'Księgowość, VAT, kadry i kontakt z urzędami dla jednoosobowych firm. Stała miesięczna cena i dokumenty wysyłane online.',
    slowaKluczowe: ['biuro rachunkowe JDG', 'księgowość online', 'księgowa dla jednoosobowej firmy'],
  },
  motyw: {
    styl: 'techniczny-precyzyjny',
    paleta: {
      tlo: '#F5F7FA', powierzchnia: '#E9EEF5', tekst: '#0F1B33', tekstPrzygaszony: '#46516A', akcent: '#C6F432',
      naAkcencie: '#0F1B33', akcentTekst: '#2C4C9C', linia: '#D3DAE6', ciemne: '#0F1B33', naCiemnym: '#F5F7FA',
    },
    fonty: { naglowki: 'Space Grotesk', tekst: 'Inter' },
    zaokraglenie: 'lekkie',
    gestosc: 'normalna',
    skalaTypografii: 'wyrazista',
    animacje: 'subtelne',
    efekty: ['przyklejony-naglowek', 'pojawianie', 'pasek-cta-mobile', 'mikrointerakcje'],
  },
  strony: [
    {
      slug: '',
      tytul: 'Start',
      sekcje: [
        {
          id: 'start', typ: 'hero', wariant: 'hero-z-formularzem',
          dane: {
            nadtytul: 'Biuro rachunkowe dla JDG',
            naglowek: 'Księgowość, o której nie musisz myśleć.',
            wyroznienie: 'nie musisz myśleć.',
            podtytul: 'Prowadzimy księgi jednoosobowych firm: od faktur i VAT po ZUS i roczne zeznanie. Ty prowadzisz biznes, my pilnujemy terminów.',
            przyciski: [
              { etykieta: 'Umów bezpłatną rozmowę', cel: '#start', styl: 'glowny' },
              { etykieta: 'Zobacz cennik', cel: '#cennik', styl: 'drugi' },
            ],
            fakty: [
              { etykieta: 'Bezpłatna rozmowa', wartosc: 'poznajemy Twoją firmę, zanim cokolwiek podpiszesz' },
              { etykieta: 'Wszystko online', wartosc: 'dokumenty wysyłasz zdjęciem albo mailem' },
              { etykieta: 'Stała cena', wartosc: 'znasz ją z góry, bez dopłat za każdy dokument' },
            ],
          },
        },
        {
          id: 'oferta', typ: 'oferta', wariant: 'oferta-siatka', wMenu: 'Oferta',
          dane: {
            naglowek: 'Wszystko, czego potrzebuje jednoosobowa firma.',
            wstep: 'Jedna osoba prowadzi Twoje sprawy od początku do końca – wiesz, do kogo dzwonić.',
            pozycje: [
              { tytul: 'Księga przychodów i rozchodów', opis: 'Księgujemy faktury, pilnujemy zaliczek na podatek i przypominamy o terminach.', ikona: 'kalkulator' },
              { tytul: 'VAT i JPK', opis: 'Rozliczenia miesięczne i kwartalne, pliki JPK wysyłane w terminie.', ikona: 'dokument' },
              { tytul: 'Kadry i płace', opis: 'Umowy, listy płac i deklaracje ZUS, gdy zatrudnisz pierwszą osobę.', ikona: 'osoba' },
              { tytul: 'Kontakt z urzędami', opis: 'Odpowiadamy na pisma z urzędu skarbowego i ZUS w Twoim imieniu.', ikona: 'tarcza' },
            ],
          },
        },
        {
          id: 'jak-dzialamy', typ: 'kroki', wariant: 'kroki-ciemne', wMenu: 'Jak działamy',
          dane: {
            naglowek: 'Zmiana biura w czterech krokach.',
            kroki: [
              { tytul: 'Rozmowa', opis: 'Opowiadasz o firmie, my dobieramy pakiet i odpowiadamy na pytania.', czas: 'pierwszy dzień' },
              { tytul: 'Umowa i pełnomocnictwa', opis: 'Podpisujesz umowę online, my zgłaszamy się do urzędów.', czas: 'kilka dni' },
              { tytul: 'Przejęcie dokumentów', opis: 'Odbieramy dokumenty od poprzedniego biura i sprawdzamy zaległości.', czas: 'do końca miesiąca' },
              { tytul: 'Comiesięczna obsługa', opis: 'Wysyłasz dokumenty, my rozliczamy i informujemy o kwotach do zapłaty.', czas: 'co miesiąc' },
            ],
          },
        },
        {
          id: 'cennik', typ: 'cennik', wariant: 'cennik-kolumny', wMenu: 'Cennik',
          dane: {
            naglowek: 'Stała cena, bez dopłat za dokument.',
            wstep: 'Ceny miesięczne. Kwoty netto dla firm, brutto z 23% VAT.',
            pakiety: [
              {
                nazwa: 'Start', opis: 'Dla firm bez VAT i bez pracowników.', cenaNetto: 250, cenaBrutto: 307.5, okres: 'miesiac',
                cechy: ['Księga przychodów i rozchodów', 'Deklaracje ZUS właściciela', 'Roczne zeznanie podatkowe'],
                przycisk: { etykieta: 'Wybieram Start', cel: '#start', styl: 'drugi' },
              },
              {
                nazwa: 'Standard', opis: 'Dla czynnych podatników VAT.', cenaNetto: 400, cenaBrutto: 492, okres: 'miesiac', wyrozniony: true,
                cechy: ['Wszystko z pakietu Start', 'Rozliczenia VAT i JPK', 'Kontakt z urzędem skarbowym', 'Konsultacje telefoniczne'],
                przycisk: { etykieta: 'Wybieram Standard', cel: '#start', styl: 'glowny' },
              },
              {
                nazwa: 'Z pracownikami', opis: 'Gdy zatrudniasz pierwsze osoby.', cenaBrutto: null, okres: 'miesiac',
                cechy: ['Wszystko z pakietu Standard', 'Kadry i płace', 'Deklaracje ZUS pracowników'],
                przycisk: { etykieta: 'Zapytaj o wycenę', cel: '#start', styl: 'drugi' },
              },
            ],
            uwaga: 'Ostateczną cenę potwierdzamy po bezpłatnej rozmowie, gdy znamy liczbę dokumentów w miesiącu.',
          },
        },
        {
          id: 'pytania', typ: 'faq', wariant: 'faq-akordeon', wMenu: 'Pytania',
          dane: {
            naglowek: 'Najczęstsze pytania',
            pytania: [
              { pytanie: 'Czy muszę przywozić dokumenty do biura?', odpowiedz: 'Nie. Faktury wysyłasz zdjęciem, mailem albo przez połączenie z programem do fakturowania.' },
              { pytanie: 'Jak wygląda zmiana biura rachunkowego?', odpowiedz: 'Najlepiej od pierwszego dnia miesiąca. Przejmujemy dokumenty od poprzedniego biura i zgłaszamy się do urzędów.\n\nCałość zajmuje zwykle kilka dni roboczych.' },
              { pytanie: 'Co, jeśli dostanę pismo z urzędu?', odpowiedz: 'Przekaż je nam – przygotujemy odpowiedź i wyjaśnimy, co oznacza.' },
              { pytanie: 'Czy mogę zmienić pakiet?', odpowiedz: 'Tak, z miesiąca na miesiąc, gdy zmienia się Twoja działalność.' },
            ],
          },
        },
        {
          id: 'zacznij', typ: 'cta', wariant: 'cta-pelny',
          dane: {
            naglowek: 'Porozmawiajmy o Twojej firmie.',
            tekst: 'Pierwsza rozmowa jest bezpłatna i do niczego nie zobowiązuje.',
            przyciski: [
              { etykieta: 'Umów bezpłatną rozmowę', cel: '#start', styl: 'glowny' },
              { etykieta: 'Zadzwoń', cel: 'tel:+48600000000', styl: 'drugi' },
            ],
          },
        },
      ],
    },
  ],
  stopka: { politykaPrywatnosci: '/polityka-prywatnosci', znakKreatora: 'jasny' },
};
