import type { StronaWejscie } from '../model.ts';

/**
 * Portfolio z blogiem (Pro) pracowni projektowania wnętrz (firma i dane fikcyjne) – fikstura testów
 * renderera: hero-edytorski, galeria-karuzela (Pro), oś czasu, cennik-lista, blog z trzema wpisami
 * i podstroną jednego wpisu (BlogPosting i BreadcrumbList w pełnym SEO), kontakt minimalny.
 */
export const PRZYKLAD_STUDIO: StronaWejscie = {
  wersjaModelu: 1,
  firma: {
    nazwa: 'Studio Przestrzeń',
    branza: 'projektowanie wnętrz',
    opisKrotki: 'Pracownia projektowania wnętrz we Wrocławiu: mieszkania, małe biura i lokale usługowe – od koncepcji po nadzór nad wykonaniem.',
    typSchema: 'ProfessionalService',
    adres: { ulica: 'ul. Przykładowa 12', kod: '50-000', miasto: 'Wrocław' },
    obszar: 'Wrocław i okolice',
    telefon: '600 000 000',
    email: 'kontakt@przyklad.pl',
    godziny: [{ dni: ['pn', 'wt', 'sr', 'cz', 'pt'], od: '10:00', do: '17:00' }],
  },
  seo: {
    tytul: 'Studio Przestrzeń – projektowanie wnętrz Wrocław',
    opis: 'Projekty mieszkań, małych biur i lokali usługowych we Wrocławiu. Koncepcja, projekt wykonawczy i nadzór nad realizacją.',
    slowaKluczowe: ['projektowanie wnętrz Wrocław', 'architekt wnętrz Wrocław', 'projekt mieszkania'],
  },
  motyw: {
    styl: 'edytorski',
    paleta: {
      tlo: '#F7F5F0', powierzchnia: '#EDE9E1', tekst: '#161514', tekstPrzygaszony: '#55524C', akcent: '#2F4A3A',
      naAkcencie: '#F7F5F0', akcentTekst: '#2F4A3A', linia: '#DAD5CB', ciemne: '#1C1B19', naCiemnym: '#F7F5F0',
    },
    fonty: { naglowki: 'Instrument Serif', tekst: 'Inter' },
    zaokraglenie: 'ostre',
    gestosc: 'przestronna',
    skalaTypografii: 'monumentalna',
    animacje: 'subtelne',
    efekty: ['przyklejony-naglowek', 'pojawianie', 'wejscie-naglowka', 'lightbox', 'karuzela', 'postep-czytania', 'mikrointerakcje'],
  },
  strony: [
    {
      slug: '',
      tytul: 'Start',
      sekcje: [
        {
          id: 'start', typ: 'hero', wariant: 'hero-edytorski',
          dane: {
            nadtytul: 'Projektowanie wnętrz',
            naglowek: 'Wnętrza, w których dobrze się mieszka.',
            wyroznienie: 'dobrze się mieszka.',
            podtytul: 'Projektujemy mieszkania, małe biura i lokale usługowe. Zaczynamy od tego, jak żyjesz i pracujesz, a dopiero potem wybieramy kolory i materiały.',
            przyciski: [
              { etykieta: 'Porozmawiajmy o projekcie', cel: '#kontakt', styl: 'glowny' },
              { etykieta: 'Realizacje', cel: '#realizacje', styl: 'drugi' },
            ],
            obraz: { alt: 'Jasny salon z drewnianą podłogą i lnianą sofą', podpis: 'Zdjęcie: salon z realizacji', proporcje: '3:4' },
          },
        },
        {
          id: 'realizacje', typ: 'galeria', wariant: 'galeria-karuzela', wMenu: 'Realizacje',
          dane: {
            naglowek: 'Wybrane realizacje',
            wstep: 'Mieszkania i lokale, które zaprojektowaliśmy i których budowę nadzorowaliśmy.',
            obrazy: [
              { alt: 'Kuchnia z wyspą w mieszkaniu na Nadodrzu', podpis: 'Zdjęcie: kuchnia z wyspą', proporcje: '4:5' },
              { alt: 'Sypialnia z zabudową wnękową', podpis: 'Zdjęcie: sypialnia', proporcje: '4:5' },
              { alt: 'Łazienka z mikrocementem', podpis: 'Zdjęcie: łazienka', proporcje: '4:5' },
              { alt: 'Gabinet w małym biurze', podpis: 'Zdjęcie: gabinet', proporcje: '4:5' },
              { alt: 'Salon z biblioteczką na całą ścianę', podpis: 'Zdjęcie: salon z biblioteczką', proporcje: '4:5' },
              { alt: 'Wnętrze kawiarni z długim barem', podpis: 'Zdjęcie: kawiarnia', proporcje: '4:5' },
            ],
          },
        },
        {
          id: 'proces', typ: 'kroki', wariant: 'kroki-os-czasu', wMenu: 'Proces',
          dane: {
            naglowek: 'Jak pracujemy',
            wstep: 'Każdy etap kończy się spotkaniem i Twoją akceptacją – nie idziemy dalej bez niej.',
            kroki: [
              { tytul: 'Rozmowa i pomiar', opis: 'Poznajemy Twoje potrzeby, mierzymy wnętrze i robimy dokumentację zdjęciową.', czas: 'tydzień' },
              { tytul: 'Układ funkcjonalny', opis: 'Dwa warianty rozmieszczenia mebli i ścianek do wyboru.', czas: '2 tygodnie' },
              { tytul: 'Koncepcja i wizualizacje', opis: 'Kolory, materiały i wizualizacje najważniejszych pomieszczeń.', czas: '3 tygodnie' },
              { tytul: 'Projekt wykonawczy', opis: 'Rysunki dla wykonawców, zestawienie materiałów i kosztorys orientacyjny.', czas: '3–4 tygodnie' },
              { tytul: 'Nadzór autorski', opis: 'Wizyty na budowie i odpowiedzi na pytania ekipy.', czas: 'do końca prac' },
            ],
          },
        },
        {
          id: 'cennik', typ: 'cennik', wariant: 'cennik-lista', wMenu: 'Cennik',
          dane: {
            naglowek: 'Ile kosztuje projekt',
            wstep: 'Ceny brutto. Dokładną wycenę przygotowujemy po pierwszej rozmowie i pomiarze.',
            pakiety: [
              {
                nazwa: 'Konsultacja', opis: 'Dwie godziny w Twoim wnętrzu.', cenaBrutto: 350, okres: 'jednorazowo',
                cechy: ['Rozmowa o układzie i kolorach', 'Notatka z zaleceniami'],
                przycisk: { etykieta: 'Umów konsultację', cel: '#kontakt', styl: 'drugi' },
              },
              {
                nazwa: 'Projekt koncepcyjny', opis: 'Układ, kolory i materiały bez rysunków wykonawczych.', cenaBrutto: 4900, okres: 'od', wyrozniony: true,
                cechy: ['Dwa warianty układu', 'Wizualizacje najważniejszych pomieszczeń', 'Lista materiałów'],
                przycisk: { etykieta: 'Zapytaj o termin', cel: '#kontakt', styl: 'glowny' },
              },
              {
                nazwa: 'Projekt kompleksowy', opis: 'Koncepcja, projekt wykonawczy i nadzór autorski.', cenaBrutto: null, okres: 'jednorazowo',
                cechy: ['Wszystko z projektu koncepcyjnego', 'Projekt wykonawczy', 'Nadzór autorski'],
                przycisk: { etykieta: 'Poproś o wycenę', cel: '#kontakt', styl: 'drugi' },
              },
            ],
          },
        },
        {
          id: 'blog', typ: 'blog', wariant: 'blog-edytorski', wMenu: 'Blog',
          dane: {
            naglowek: 'Z notatnika pracowni',
            wpisy: [
              {
                tytul: 'Mała kuchnia bez kompromisów',
                lead: 'Jak zmieścić wygodny blat, zmywarkę i miejsce na zapasy w kuchni o powierzchni kilku metrów.',
                data: '2026-10-21', czasCzytania: 6, slug: 'mala-kuchnia-bez-kompromisow',
              },
              {
                tytul: 'Światło w mieszkaniu od północy',
                lead: 'Kolory ścian, lustra i lampy, które pomagają, gdy słońce nie zagląda do środka.',
                data: '2026-09-30', czasCzytania: 5, slug: 'swiatlo-od-polnocy',
              },
              {
                tytul: 'Co zamówić najpierw, gdy zaczynasz remont',
                lead: 'Kolejność zamówień, która chroni przed przestojami ekipy i nerwowym szukaniem zamienników.',
                data: '2026-09-02', czasCzytania: 7, slug: 'kolejnosc-zamowien',
              },
            ],
          },
        },
        {
          id: 'kontakt', typ: 'kontakt', wariant: 'kontakt-minimalny', wMenu: 'Kontakt',
          dane: {
            naglowek: 'Opowiedz o swoim wnętrzu',
            wstep: 'Napisz kilka zdań o mieszkaniu albo lokalu. Odpowiadamy w dni robocze.',
            pola: ['imie', 'email', 'telefon', 'wiadomosc'],
          },
        },
      ],
    },
    {
      slug: 'blog/mala-kuchnia-bez-kompromisow',
      tytul: 'Mała kuchnia bez kompromisów',
      seo: {
        tytul: 'Mała kuchnia bez kompromisów – Studio Przestrzeń',
        opis: 'Jak zmieścić wygodny blat, zmywarkę i miejsce na zapasy w kuchni o powierzchni kilku metrów.',
      },
      sekcje: [
        {
          id: 'uklad', typ: 'onas', wariant: 'onas-obraz-tekst',
          dane: {
            naglowek: 'Najpierw układ, potem fronty',
            akapity: [
              'W małej kuchni o wygodzie decyduje kolejność: lodówka, zlew, blat roboczy i płyta. Gdy ten ciąg się zgadza, nawet krótka zabudowa pracuje jak duża.',
              'Blat roboczy między zlewem a płytą powinien być możliwie najdłuższy. Lepiej oddać jedną szafkę górną niż ten fragment blatu.',
              'Szafki do sufitu i szuflady zamiast drzwiczek w dolnej zabudowie dają więcej miejsca niż dodatkowy metr kuchni.',
            ],
            obraz: { alt: 'Wąska kuchnia z jasnymi frontami i drewnianym blatem', podpis: 'Zdjęcie: mała kuchnia', proporcje: '4:5' },
          },
        },
        {
          id: 'porozmawiajmy', typ: 'cta', wariant: 'cta-pasek',
          dane: {
            naglowek: 'Planujesz kuchnię?',
            tekst: 'Zacznij od konsultacji w Twoim mieszkaniu.',
            przyciski: [{ etykieta: 'Napisz do nas', cel: '#kontakt', styl: 'glowny' }],
          },
        },
      ],
    },
  ],
  stopka: { politykaPrywatnosci: '/polityka-prywatnosci', znakKreatora: 'ciemny' },
};
