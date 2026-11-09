import type { Jezyk } from '../jezyki.ts';

/**
 * Teksty systemowe renderera (paczka 124) – wszystko, co renderer pisze sam (nie z modelu): nawigacja, etykiety
 * formularza, zgoda, komunikaty po wysyłce, stopka, dni tygodnia, daty, ceny. Każdy język ma komplet kluczy
 * (typ + test teksty.spec.ts). Teksty widoczne tylko w podglądzie edytora (puste opinie, wstęga Pro, ramki zdjęć)
 * zostają po polsku – to podpowiedzi dla klienta, nie treść strony.
 */
export interface TekstyStrony {
  przejdzDoTresci: string;
  menu: string;
  nawGlowna: string;
  nawStopka: string;
  okruszki: string;
  start: string;
  kontakt: string;
  godziny: string;
  naSkroty: string;
  politykaPrywatnosci: string;
  regulamin: string;
  szybkiKontakt: string;
  zadzwon: string;
  jezyk: string;
  stworzoneW: string;
  stworzoneWKreator: string;
  // formularz
  imie: string;
  email: string;
  telefon: string;
  firma: string;
  termin: string;
  terminPodpowiedz: string;
  usluga: string;
  wiadomosc: string;
  opcjonalnie: string;
  wybierzUsluge: string;
  innaUsluga: string;
  /** `{firma}` – nazwa administratora danych. */
  zgoda: string;
  /** `{link}` – link „polityce prywatności”. */
  szczegolyPolityki: string;
  politykiLink: string;
  zostawPuste: string;
  wyslijWiadomosc: string;
  wyslijTermin: string;
  wyslij: string;
  formOk: string;
  formBlad: string;
  formPoPublikacji: string;
  napiszDoNas: string;
  odpowiemy: string;
  // dane kontaktowe
  adres: string;
  telefonEt: string;
  emailEt: string;
  godzinyOtwarcia: string;
  obszar: string;
  nieczynne: string;
  dojazd: string;
  otworzWMapach: string;
  /** Pełne nazwy dni (pn…nd), wielką literą. */
  dniPelne: [string, string, string, string, string, string, string];
  /** Nazwy dni w środku zdania (pn…nd). */
  dniMale: [string, string, string, string, string, string, string];
  // sklep, blog, opinie, FAQ
  dostepny: string;
  ostatnie: string;
  niedostepny: string;
  naZamowienie: string;
  zamow: string;
  zamowienie: string;
  czytajWpis: string;
  minCzytania: string;
  /** Miesiące w formie do daty („1 listopada 2026”). */
  miesiace: string[];
  zrodloOpinii: string;
  opinieZGoogle: string;
  galeria: string;
  opinie: string;
  poprzednie: string;
  nastepne: string;
  nieMaPytania: string;
  napiszNa: string;
  alboZadzwon: string;
  zadzwonDwukropek: string;
  // cennik
  wycenaIndywidualna: string;
  od: string;
  netto: string;
  brutto: string;
  naMiesiac: string;
  naRok: string;
  okresRozliczenia: string;
  miesiecznie: string;
  rocznie: string;
  polecany: string;
  zapytajOPakiet: string;
  tak: string;
  nie: string;
  // powiększanie zdjęć (skrypt strony – przez atrybut data-lb)
  powiekszone: string;
  zamknij: string;
  poprzednieZdjecie: string;
  nastepneZdjecie: string;
}

const PL: TekstyStrony = {
  przejdzDoTresci: 'Przejdź do treści',
  menu: 'Menu',
  nawGlowna: 'Główna',
  nawStopka: 'Stopka',
  okruszki: 'Okruszki',
  start: 'Start',
  kontakt: 'Kontakt',
  godziny: 'Godziny',
  naSkroty: 'Na skróty',
  politykaPrywatnosci: 'Polityka prywatności',
  regulamin: 'Regulamin',
  szybkiKontakt: 'Szybki kontakt',
  zadzwon: 'Zadzwoń',
  jezyk: 'Język',
  stworzoneW: 'Stworzone w',
  stworzoneWKreator: 'Stworzone w Verris Kreator',
  imie: 'Imię',
  email: 'E-mail',
  telefon: 'Telefon',
  firma: 'Firma',
  termin: 'Preferowany termin',
  terminPodpowiedz: 'np. czwartek po 16:00',
  usluga: 'Usługa',
  wiadomosc: 'Wiadomość',
  opcjonalnie: '(opcjonalnie)',
  wybierzUsluge: 'Wybierz usługę',
  innaUsluga: 'Inna / jeszcze nie wiem',
  zgoda: 'Wyrażam zgodę na przetwarzanie podanych danych w celu odpowiedzi na moją wiadomość. Administratorem danych jest {firma}.',
  szczegolyPolityki: 'Szczegóły w {link}.',
  politykiLink: 'polityce prywatności',
  zostawPuste: 'Zostaw to pole puste',
  wyslijWiadomosc: 'Wyślij wiadomość',
  wyslijTermin: 'Wyślij prośbę o termin',
  wyslij: 'Wyślij',
  formOk: 'Dziękujemy, wiadomość została wysłana. Odpowiemy najszybciej, jak to możliwe.',
  formBlad: 'Nie udało się wysłać wiadomości. Spróbuj ponownie za chwilę albo skontaktuj się z nami telefonicznie lub mailowo.',
  formPoPublikacji: 'Formularz zadziała po publikacji strony.',
  napiszDoNas: 'Napisz do nas',
  odpowiemy: 'Odpowiemy najszybciej, jak to możliwe.',
  adres: 'Adres',
  telefonEt: 'Telefon',
  emailEt: 'E-mail',
  godzinyOtwarcia: 'Godziny otwarcia',
  obszar: 'Obszar działania',
  nieczynne: 'nieczynne',
  dojazd: 'Dojazd',
  otworzWMapach: 'Otwórz w mapach',
  dniPelne: ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'],
  dniMale: ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'],
  dostepny: 'Dostępny',
  ostatnie: 'Ostatnie sztuki',
  niedostepny: 'Chwilowo niedostępny',
  naZamowienie: 'Na zamówienie',
  zamow: 'Zamów',
  zamowienie: 'Zamówienie',
  czytajWpis: 'Czytaj wpis',
  minCzytania: 'min czytania',
  miesiace: ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'],
  zrodloOpinii: 'Źródło',
  opinieZGoogle: 'Opinie z Google',
  galeria: 'Galeria',
  opinie: 'Opinie',
  poprzednie: 'poprzednie',
  nastepne: 'następne',
  nieMaPytania: 'Nie ma tu Twojego pytania?',
  napiszNa: 'Napisz na',
  alboZadzwon: 'albo zadzwoń:',
  zadzwonDwukropek: 'Zadzwoń:',
  wycenaIndywidualna: 'Wycena indywidualna',
  od: 'od',
  netto: 'netto',
  brutto: 'brutto',
  naMiesiac: '/ mies.',
  naRok: '/ rok',
  okresRozliczenia: 'Okres rozliczenia',
  miesiecznie: 'Miesięcznie',
  rocznie: 'Rocznie',
  polecany: 'Polecany',
  zapytajOPakiet: 'Zapytaj o pakiet',
  tak: 'Tak',
  nie: 'Nie',
  powiekszone: 'Powiększone zdjęcie',
  zamknij: 'Zamknij',
  poprzednieZdjecie: 'Poprzednie zdjęcie',
  nastepneZdjecie: 'Następne zdjęcie',
};

const EN: TekstyStrony = {
  przejdzDoTresci: 'Skip to content',
  menu: 'Menu',
  nawGlowna: 'Main',
  nawStopka: 'Footer',
  okruszki: 'Breadcrumbs',
  start: 'Home',
  kontakt: 'Contact',
  godziny: 'Opening hours',
  naSkroty: 'Quick links',
  politykaPrywatnosci: 'Privacy policy',
  regulamin: 'Terms',
  szybkiKontakt: 'Quick contact',
  zadzwon: 'Call',
  jezyk: 'Language',
  stworzoneW: 'Made with',
  stworzoneWKreator: 'Made with Verris Kreator',
  imie: 'Name',
  email: 'Email',
  telefon: 'Phone',
  firma: 'Company',
  termin: 'Preferred date',
  terminPodpowiedz: 'e.g. Thursday after 4 pm',
  usluga: 'Service',
  wiadomosc: 'Message',
  opcjonalnie: '(optional)',
  wybierzUsluge: 'Choose a service',
  innaUsluga: 'Other / not sure yet',
  zgoda: 'I agree to the processing of the data I have provided in order to reply to my message. The data controller is {firma}.',
  szczegolyPolityki: 'Details in the {link}.',
  politykiLink: 'privacy policy',
  zostawPuste: 'Leave this field empty',
  wyslijWiadomosc: 'Send message',
  wyslijTermin: 'Request an appointment',
  wyslij: 'Send',
  formOk: 'Thank you, your message has been sent. We will reply as soon as possible.',
  formBlad: 'Your message could not be sent. Please try again in a moment or contact us by phone or email.',
  formPoPublikacji: 'The form will work once the site is published.',
  napiszDoNas: 'Write to us',
  odpowiemy: 'We will reply as soon as possible.',
  adres: 'Address',
  telefonEt: 'Phone',
  emailEt: 'Email',
  godzinyOtwarcia: 'Opening hours',
  obszar: 'Service area',
  nieczynne: 'closed',
  dojazd: 'Directions',
  otworzWMapach: 'Open in maps',
  dniPelne: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  dniMale: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  dostepny: 'In stock',
  ostatnie: 'Last items',
  niedostepny: 'Temporarily unavailable',
  naZamowienie: 'Made to order',
  zamow: 'Order',
  zamowienie: 'Order',
  czytajWpis: 'Read the post',
  minCzytania: 'min read',
  miesiace: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  zrodloOpinii: 'Source',
  opinieZGoogle: 'Google reviews',
  galeria: 'Gallery',
  opinie: 'Reviews',
  poprzednie: 'previous',
  nastepne: 'next',
  nieMaPytania: 'Your question is not here?',
  napiszNa: 'Write to',
  alboZadzwon: 'or call:',
  zadzwonDwukropek: 'Call:',
  wycenaIndywidualna: 'Individual quote',
  od: 'from',
  netto: 'excl. VAT',
  brutto: 'incl. VAT',
  naMiesiac: '/ month',
  naRok: '/ year',
  okresRozliczenia: 'Billing period',
  miesiecznie: 'Monthly',
  rocznie: 'Yearly',
  polecany: 'Recommended',
  zapytajOPakiet: 'Ask about this package',
  tak: 'Yes',
  nie: 'No',
  powiekszone: 'Enlarged photo',
  zamknij: 'Close',
  poprzednieZdjecie: 'Previous photo',
  nastepneZdjecie: 'Next photo',
};

const DE: TekstyStrony = {
  przejdzDoTresci: 'Zum Inhalt springen',
  menu: 'Menü',
  nawGlowna: 'Hauptnavigation',
  nawStopka: 'Fußzeile',
  okruszki: 'Brotkrümelnavigation',
  start: 'Start',
  kontakt: 'Kontakt',
  godziny: 'Öffnungszeiten',
  naSkroty: 'Schnellzugriff',
  politykaPrywatnosci: 'Datenschutzerklärung',
  regulamin: 'AGB',
  szybkiKontakt: 'Schneller Kontakt',
  zadzwon: 'Anrufen',
  jezyk: 'Sprache',
  stworzoneW: 'Erstellt mit',
  stworzoneWKreator: 'Erstellt mit Verris Kreator',
  imie: 'Name',
  email: 'E-Mail',
  telefon: 'Telefon',
  firma: 'Firma',
  termin: 'Wunschtermin',
  terminPodpowiedz: 'z. B. Donnerstag nach 16 Uhr',
  usluga: 'Leistung',
  wiadomosc: 'Nachricht',
  opcjonalnie: '(optional)',
  wybierzUsluge: 'Leistung wählen',
  innaUsluga: 'Andere / weiß ich noch nicht',
  zgoda: 'Ich willige in die Verarbeitung meiner Angaben zur Beantwortung meiner Nachricht ein. Verantwortlich für die Daten ist {firma}.',
  szczegolyPolityki: 'Einzelheiten in der {link}.',
  politykiLink: 'Datenschutzerklärung',
  zostawPuste: 'Dieses Feld leer lassen',
  wyslijWiadomosc: 'Nachricht senden',
  wyslijTermin: 'Termin anfragen',
  wyslij: 'Senden',
  formOk: 'Vielen Dank, Ihre Nachricht wurde gesendet. Wir antworten so schnell wie möglich.',
  formBlad: 'Die Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es gleich noch einmal oder kontaktieren Sie uns telefonisch oder per E-Mail.',
  formPoPublikacji: 'Das Formular funktioniert nach der Veröffentlichung der Website.',
  napiszDoNas: 'Schreiben Sie uns',
  odpowiemy: 'Wir antworten so schnell wie möglich.',
  adres: 'Adresse',
  telefonEt: 'Telefon',
  emailEt: 'E-Mail',
  godzinyOtwarcia: 'Öffnungszeiten',
  obszar: 'Einzugsgebiet',
  nieczynne: 'geschlossen',
  dojazd: 'Anfahrt',
  otworzWMapach: 'In Karten öffnen',
  dniPelne: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
  dniMale: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
  dostepny: 'Verfügbar',
  ostatnie: 'Nur noch wenige',
  niedostepny: 'Vorübergehend nicht verfügbar',
  naZamowienie: 'Auf Bestellung',
  zamow: 'Bestellen',
  zamowienie: 'Bestellung',
  czytajWpis: 'Beitrag lesen',
  minCzytania: 'Min. Lesezeit',
  miesiace: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  zrodloOpinii: 'Quelle',
  opinieZGoogle: 'Bewertungen auf Google',
  galeria: 'Galerie',
  opinie: 'Bewertungen',
  poprzednie: 'zurück',
  nastepne: 'weiter',
  nieMaPytania: 'Ihre Frage ist nicht dabei?',
  napiszNa: 'Schreiben Sie an',
  alboZadzwon: 'oder rufen Sie an:',
  zadzwonDwukropek: 'Rufen Sie an:',
  wycenaIndywidualna: 'Individuelles Angebot',
  od: 'ab',
  netto: 'netto',
  brutto: 'brutto',
  naMiesiac: '/ Monat',
  naRok: '/ Jahr',
  okresRozliczenia: 'Abrechnungszeitraum',
  miesiecznie: 'Monatlich',
  rocznie: 'Jährlich',
  polecany: 'Empfohlen',
  zapytajOPakiet: 'Paket anfragen',
  tak: 'Ja',
  nie: 'Nein',
  powiekszone: 'Vergrößertes Foto',
  zamknij: 'Schließen',
  poprzednieZdjecie: 'Vorheriges Foto',
  nastepneZdjecie: 'Nächstes Foto',
};

const UK: TekstyStrony = {
  przejdzDoTresci: 'Перейти до змісту',
  menu: 'Меню',
  nawGlowna: 'Головна навігація',
  nawStopka: 'Нижній колонтитул',
  okruszki: 'Навігаційний ланцюжок',
  start: 'Головна',
  kontakt: 'Контакти',
  godziny: 'Години роботи',
  naSkroty: 'Швидкі посилання',
  politykaPrywatnosci: 'Політика конфіденційності',
  regulamin: 'Правила',
  szybkiKontakt: 'Швидкий контакт',
  zadzwon: 'Зателефонувати',
  jezyk: 'Мова',
  stworzoneW: 'Створено у',
  stworzoneWKreator: 'Створено у Verris Kreator',
  imie: 'Ім’я',
  email: 'Електронна пошта',
  telefon: 'Телефон',
  firma: 'Компанія',
  termin: 'Бажаний термін',
  terminPodpowiedz: 'напр. четвер після 16:00',
  usluga: 'Послуга',
  wiadomosc: 'Повідомлення',
  opcjonalnie: '(необов’язково)',
  wybierzUsluge: 'Виберіть послугу',
  innaUsluga: 'Інша / ще не знаю',
  zgoda: 'Я погоджуюся на обробку наданих даних для відповіді на моє повідомлення. Адміністратором даних є {firma}.',
  szczegolyPolityki: 'Докладніше – у {link}.',
  politykiLink: 'політиці конфіденційності',
  zostawPuste: 'Залиште це поле порожнім',
  wyslijWiadomosc: 'Надіслати повідомлення',
  wyslijTermin: 'Записатися',
  wyslij: 'Надіслати',
  formOk: 'Дякуємо, повідомлення надіслано. Ми відповімо якнайшвидше.',
  formBlad: 'Не вдалося надіслати повідомлення. Спробуйте ще раз за хвилину або зв’яжіться з нами телефоном чи електронною поштою.',
  formPoPublikacji: 'Форма запрацює після публікації сайту.',
  napiszDoNas: 'Напишіть нам',
  odpowiemy: 'Ми відповімо якнайшвидше.',
  adres: 'Адреса',
  telefonEt: 'Телефон',
  emailEt: 'Електронна пошта',
  godzinyOtwarcia: 'Години роботи',
  obszar: 'Територія обслуговування',
  nieczynne: 'зачинено',
  dojazd: 'Як дістатися',
  otworzWMapach: 'Відкрити на карті',
  dniPelne: ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П’ятниця', 'Субота', 'Неділя'],
  dniMale: ['понеділок', 'вівторок', 'середа', 'четвер', 'п’ятниця', 'субота', 'неділя'],
  dostepny: 'В наявності',
  ostatnie: 'Останні одиниці',
  niedostepny: 'Тимчасово недоступний',
  naZamowienie: 'Під замовлення',
  zamow: 'Замовити',
  zamowienie: 'Замовлення',
  czytajWpis: 'Читати допис',
  minCzytania: 'хв читання',
  miesiace: ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'],
  zrodloOpinii: 'Джерело',
  opinieZGoogle: 'Відгуки з Google',
  galeria: 'Галерея',
  opinie: 'Відгуки',
  poprzednie: 'попередні',
  nastepne: 'наступні',
  nieMaPytania: 'Немає вашого запитання?',
  napiszNa: 'Напишіть на',
  alboZadzwon: 'або зателефонуйте:',
  zadzwonDwukropek: 'Зателефонуйте:',
  wycenaIndywidualna: 'Індивідуальна ціна',
  od: 'від',
  netto: 'без ПДВ',
  brutto: 'з ПДВ',
  naMiesiac: '/ міс.',
  naRok: '/ рік',
  okresRozliczenia: 'Період оплати',
  miesiecznie: 'Щомісяця',
  rocznie: 'Щороку',
  polecany: 'Рекомендуємо',
  zapytajOPakiet: 'Запитати про пакет',
  tak: 'Так',
  nie: 'Ні',
  powiekszone: 'Збільшене фото',
  zamknij: 'Закрити',
  poprzednieZdjecie: 'Попереднє фото',
  nastepneZdjecie: 'Наступне фото',
};

export const TEKSTY: Record<Jezyk, TekstyStrony> = { pl: PL, en: EN, de: DE, uk: UK };

export function teksty(jezyk: Jezyk): TekstyStrony {
  return TEKSTY[jezyk] ?? PL;
}

/** Kwota: pl „1 299 zł”; en „1,299 PLN”; de „1.299,50 PLN”; uk „1 299,50 PLN” (twarde spacje). */
export function kwota(wartosc: number, jezyk: Jezyk): string {
  const [c, g] = wartosc.toFixed(2).split('.') as [string, string];
  const sep = jezyk === 'en' ? ',' : jezyk === 'de' ? '.' : '\u00a0';
  const calk = c.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const ulamek = g === '00' ? '' : `${jezyk === 'en' ? '.' : ','}${g}`;
  return `${calk}${ulamek}\u00a0${jezyk === 'pl' ? 'zł' : 'PLN'}`;
}

/** Data z ISO: pl/uk „1 listopada 2026”, en „1 November 2026”, de „1. November 2026”. */
export function dataWJezyku(iso: string, jezyk: Jezyk): string {
  const [r, m, d] = iso.split('-').map(Number) as [number, number, number];
  const miesiac = teksty(jezyk).miesiace[m - 1] ?? '';
  return `${d}${jezyk === 'de' ? '.' : ''} ${miesiac} ${r}`;
}

/** Wstawienie wartości w szablon `{nazwa}` (wartości już po esc, jeśli trafiają do HTML). */
export function wstaw(szablon: string, wartosci: Record<string, string>): string {
  return szablon.replace(/\{(\w+)\}/g, (m, k: string) => wartosci[k] ?? m);
}
