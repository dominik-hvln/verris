/**
 * PB-18 — tickety v2: klasyfikacja zgłoszenia, zmienne szablonów i szkic
 * odpowiedzi. Czysta logika bez bazy — dane zbiera TicketContextService.
 * Bez AI: reguły słownikowe, żeby szkic był przewidywalny i testowalny.
 */

export type TicketCategory = 'DNS' | 'SSL' | 'POCZTA' | 'PLATNOSC' | 'MIGRACJA' | 'AWARIA' | 'INNE';

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  DNS: 'DNS i domena',
  SSL: 'Certyfikat SSL',
  POCZTA: 'Poczta',
  PLATNOSC: 'Płatność',
  MIGRACJA: 'Migracja',
  AWARIA: 'Awaria',
  INNE: 'Inne',
};

// Rdzenie słów bez polskich znaków (tekst normalizujemy tak samo).
const KEYWORDS: Record<Exclude<TicketCategory, 'INNE'>, string[]> = {
  PLATNOSC: ['faktur', 'platnos', 'zaplac', 'oplat', 'portfel', 'doladow', 'karta', 'karty', 'przelew', 'blik', 'rachun', 'saldo', 'zwrot', 'stripe'],
  MIGRACJA: ['migrac', 'przenies', 'przeniesc', 'z innego hostingu', 'od innego dostawcy', 'transfer strony', 'kopie strony'],
  SSL: ['ssl', 'certyfikat', 'https', 'klodk', 'niezabezpieczon', 'lets encrypt', "let's encrypt", 'nie jest bezpieczna'],
  POCZTA: ['poczt', 'e-mail', 'email', 'mail', 'skrzynk', 'spam', 'smtp', 'imap', 'outlook', 'thunderbird', 'dkim', 'spf', 'dmarc', 'wiadomosc nie dochodzi'],
  DNS: ['dns', 'rekord', 'domen', 'nameserver', 'serwery nazw', 'propagac', 'cname', 'wskazuje', 'rejestrator'],
  AWARIA: ['nie dziala', 'awaria', 'blad 500', ' 500', '502', '503', '504', 'lezy', 'nie otwiera', 'nie laduje', 'timeout', 'biala strona', 'error'],
};
// Przy remisie wygrywa kategoria konkretna; „awaria” jest ostatnia, bo
// „poczta nie działa” to problem z pocztą, nie ogólna awaria.
const TIE_ORDER: TicketCategory[] = ['PLATNOSC', 'MIGRACJA', 'SSL', 'POCZTA', 'DNS', 'AWARIA'];
const TOPIC_TO_CATEGORY: Record<string, TicketCategory> = {
  DNS: 'DNS',
  DOMAIN: 'DNS',
  SSL: 'SSL',
  EMAIL: 'POCZTA',
  BILLING: 'PLATNOSC',
};

export const normalize = (s: string) =>
  ` ${s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/\s+/g, ' ')} `;

export function classifyTicket(t: { subject: string; message: string; topic?: string | null }): TicketCategory {
  const text = normalize(`${t.subject} ${t.message}`);
  const score = new Map<TicketCategory, number>();
  for (const [cat, words] of Object.entries(KEYWORDS) as [TicketCategory, string[]][]) {
    score.set(cat, words.filter((w) => text.includes(w)).length);
  }
  const fromTopic = t.topic ? TOPIC_TO_CATEGORY[t.topic.toUpperCase()] : undefined;
  if (fromTopic) score.set(fromTopic, (score.get(fromTopic) ?? 0) + 2);
  let best: TicketCategory = 'INNE';
  let bestScore = 0;
  for (const cat of TIE_ORDER) {
    const s = score.get(cat) ?? 0;
    if (s > bestScore) {
      best = cat;
      bestScore = s;
    }
  }
  return best;
}

/** Słowa do wyszukania artykułów w bazie wiedzy dla kategorii. */
export const KB_TERMS: Record<TicketCategory, string[]> = {
  DNS: ['DNS', 'domen'],
  SSL: ['SSL', 'certyfikat'],
  POCZTA: ['poczt', 'SPF', 'skrzynk'],
  PLATNOSC: ['płatno', 'faktur', 'portfel'],
  MIGRACJA: ['przenies', 'migrac'],
  AWARIA: ['nie działa', 'błąd'],
  INNE: [],
};

export interface TicketDraftContext {
  firstName: string | null;
  lastName: string | null;
  email: string;
  company: string | null;
  ticketId: string;
  subject: string;
  slaResolveDueAt: Date | null;
  /** Usługa, której dotyczy zgłoszenie (najczęściej jedyna / pierwsza aktywna). */
  service: { plan: string | null; domain: string | null; sslExpiresAt: Date | null; siteDown: boolean } | null;
  walletBalance: string | null;
  lastInvoice: { number: string; status: string } | null;
  kb: { title: string; url: string }[];
}

const fmtDate = (d: Date) => d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' });
const fmtDateTime = (d: Date) =>
  d.toLocaleString('pl-PL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });

/** Zmienne szablonów: {{imie}}, {{nazwisko}}, {{email}}, {{firma}}, {{nr}}, {{temat}}, {{domena}}, {{usluga}}, {{termin}}. */
export function templateVars(c: TicketDraftContext): Record<string, string> {
  return {
    imie: c.firstName ?? '',
    nazwisko: c.lastName ?? '',
    email: c.email,
    firma: c.company ?? '',
    nr: c.ticketId.slice(0, 8),
    temat: c.subject,
    domena: c.service?.domain ?? '',
    usluga: c.service?.plan ?? '',
    termin: c.slaResolveDueAt ? fmtDateTime(c.slaResolveDueAt) : '',
  };
}

/** Podstawia {{zmienna}} (wielkość liter i spacje bez znaczenia); nieznane zostawia, żeby było widać literówkę. */
export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-ząćęłńóśźż]+)\s*\}\}/gi, (m, key: string) => {
    const k = normalize(key).trim();
    return k in vars ? vars[k] : m;
  });
}

const INVOICE_STATUS: Record<string, string> = {
  DRAFT: 'w przygotowaniu',
  OPEN: 'oczekuje na płatność',
  PAID: 'opłacony',
  VOID: 'anulowany',
  UNCOLLECTIBLE: 'nieściągalny',
};

/** Szkic odpowiedzi do akceptacji przez pracownika — nigdy nie wysyłany automatycznie. */
export function buildDraft(category: TicketCategory, c: TicketDraftContext): string {
  const dom = c.service?.domain;
  const domTxt = dom ? ` ${dom}` : '';
  const lines: string[] = [`Dzień dobry${c.firstName ? ` ${c.firstName}` : ''},`, 'dziękujemy za zgłoszenie.'];

  switch (category) {
    case 'DNS':
      lines.push(
        `Sprawdzamy konfigurację domeny${domTxt}. Żeby domena działała na hostingu Verris, u rejestratora muszą być ustawione nasze serwery nazw albo rekord A wskazujący na serwer usługi.`,
        'Zmiany w DNS rozchodzą się zwykle w ciągu kilku godzin, wyjątkowo do 48 godzin. Jeśli problem nadal występuje, prosimy o informację, od kiedy go widać i pod jakim adresem.',
      );
      break;
    case 'SSL':
      lines.push(
        c.service?.sslExpiresAt
          ? `Certyfikat SSL dla domeny${domTxt} jest ważny do ${fmtDate(c.service.sslExpiresAt)}.`
          : `Sprawdzamy certyfikat SSL dla domeny${domTxt}.`,
        'Certyfikat Let’s Encrypt wystawiamy i odnawiamy automatycznie, gdy domena kieruje na nasz serwer. Po zmianie DNS wystawienie może potrwać do godziny.',
      );
      break;
    case 'POCZTA':
      lines.push(
        `W panelu, w zakładce Poczta, sekcja „Dostarczalność poczty” pokazuje stan rekordów SPF, DKIM i DMARC${dom ? ` dla ${dom}` : ''} i pozwala je poprawić jednym kliknięciem.`,
        'Do programu pocztowego: serwer IMAP (port 993, SSL) i SMTP (port 587, STARTTLS), login to pełny adres skrzynki.',
      );
      break;
    case 'PLATNOSC':
      lines.push(
        c.walletBalance != null ? `Na koncie jest obecnie ${c.walletBalance} kredytów (1 kredyt = 1 zł).` : 'Sprawdzamy stan rozliczeń konta.',
        c.lastInvoice
          ? `Ostatni dokument rozliczeniowy: ${c.lastInvoice.number} — ${INVOICE_STATUS[c.lastInvoice.status] ?? c.lastInvoice.status}.`
          : '',
        'Prosimy nie przesyłać danych karty ani haseł w zgłoszeniu.',
      );
      break;
    case 'MIGRACJA':
      lines.push(
        'Przeniesienie strony zlecisz w panelu w sekcji „Migracje”. Potrzebujemy dostępu do obecnego hostingu (FTP lub panel) — kopiujemy pliki, bazy i pocztę bez przerwy w działaniu strony.',
        `Na koniec przełączamy DNS${domTxt}, więc do tego momentu wszystko działa u dotychczasowego dostawcy.`,
      );
      break;
    case 'AWARIA':
      lines.push(
        c.service?.siteDown
          ? `Potwierdzamy — nasz monitoring też widzi problem z dostępnością${domTxt}. Pracujemy nad tym.`
          : `Sprawdzamy działanie usługi${c.service?.plan ? ` ${c.service.plan}` : ''}${domTxt}.`,
        c.slaResolveDueAt ? `Wrócimy z informacją najpóźniej do ${fmtDateTime(c.slaResolveDueAt)}.` : 'Wrócimy z informacją, gdy tylko ustalimy przyczynę.',
      );
      break;
    default:
      lines.push('Przyglądamy się sprawie i wrócimy z odpowiedzią.');
  }

  if (c.kb.length > 0) lines.push(['Może się przydać:', ...c.kb.map((a) => `– ${a.title}: ${a.url}`)].join('\n'));
  lines.push('Pozdrawiamy,\nZespół Verris');
  // Akapity oddzielone pustą linią; puste pozycje (brak danych) wypadają.
  return lines.filter(Boolean).join('\n\n');
}
