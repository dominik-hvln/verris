import { createHash } from 'node:crypto';
import PostalMime, { type Address, type Email } from 'postal-mime';
import { idyZNaglowka, poprawnyMessageId } from '../../mail/watek-zgloszenia.js';
import { sanitizeOriginalFilename } from '../ticket-attachment.utils.js';

/**
 * F3.7 (OE-19, OE-20) — rozbiór maila przychodzącego do zgłoszeń: nagłówki (Message-ID, wątek, nadawca), filtr
 * automatów i spamu, treść bez cytatu poprzedniej wiadomości, bezpieczne załączniki. MIME: postal-mime (bez zależności,
 * RFC 2045–2047/2231). Czyste funkcje — testowane na plikach .eml (__fixtures__).
 */

export interface ZalacznikMaila {
  nazwa: string;
  typ: string;
  tresc: Buffer;
}

export interface PominietyZalacznik {
  nazwa: string;
  powod: string;
}

export interface MailPrzychodzacy {
  messageId: string;
  nadawca: string;
  nadawcaNazwa: string | null;
  temat: string;
  doAdresy: string[];
  /** In-Reply-To, potem References (od najstarszego). */
  watek: string[];
  data: Date | null;
  naglowki: { key: string; value: string }[];
  returnPath: string | null;
  tekst: string;
  zalaczniki: ZalacznikMaila[];
  pominiete: PominietyZalacznik[];
}

/** Treść zgłoszenia z maila — dłuższa zostaje ucięta (oryginał w skrzynce zespołu). */
export const TRESC_MAX_ZNAKOW = 50_000;
/** Najwyżej tyle załączników z jednego maila (jak formularz w panelu). */
export const ZALACZNIKI_MAX = 5;
/** Limit jednego załącznika (jak upload w panelu: 8 MB). */
export const ZALACZNIK_MAX_BAJTOW = 8 * 1024 * 1024;

const adres = (a: Address | undefined): { address: string; name: string } | null =>
  a && 'address' in a && a.address ? { address: a.address, name: a.name } : null;

const plaskie = (lista: Address[] | undefined): string[] =>
  (lista ?? []).flatMap((a) => ('group' in a && a.group ? a.group.map((g) => g.address) : a.address ? [a.address] : [])).map((x) => x.toLowerCase());

/** Message-ID wiadomości; bez nagłówka — stały skrót z nagłówków (ten sam mail = ten sam identyfikator). */
export function identyfikator(email: Pick<Email, 'messageId' | 'headers'>): string {
  const id = email.messageId?.trim();
  if (id && poprawnyMessageId(id)) return id;
  const h = createHash('sha256');
  for (const x of email.headers) if (['from', 'date', 'subject', 'to'].includes(x.key)) h.update(`${x.key}:${x.value}\n`);
  return `<brak-id.${h.digest('hex').slice(0, 40)}@poczta.verris>`;
}

/** Nagłówki (bez treści) — do decyzji przed pobraniem całości. */
export async function parsujNaglowki(naglowki: Buffer): Promise<Omit<MailPrzychodzacy, 'tekst' | 'zalaczniki' | 'pominiete'>> {
  const email = await PostalMime.parse(Buffer.concat([naglowki, Buffer.from('\r\n\r\n')]));
  return podstawy(email);
}

/**
 * Bez znaku NUL — PostgreSQL nie przyjmuje go w kolumnach tekstowych ani w JSONB, a mail z „=00” (QP) w temacie,
 * nazwie nadawcy, nagłówku albo treści kończył się błędem zapisu przy każdym przebiegu (mail bez słowa kluczowego,
 * 50 takich maili zatrzymywało import). Przegląd F3.7.
 */
export const bezNul = (s: string): string => s.replace(/\u0000/g, '');

function podstawy(email: Email): Omit<MailPrzychodzacy, 'tekst' | 'zalaczniki' | 'pominiete'> {
  const od = adres(email.from);
  const data = email.date ? new Date(email.date) : null;
  return {
    messageId: identyfikator(email),
    nadawca: bezNul(od?.address ?? '').trim().toLowerCase(),
    nadawcaNazwa: bezNul(od?.name ?? '').trim() || null,
    temat: bezNul(email.subject ?? '').replace(/\s+/g, ' ').trim(),
    doAdresy: [...new Set([...plaskie(email.to), ...plaskie(email.cc)].map(bezNul))],
    watek: [...idyZNaglowka(email.inReplyTo), ...idyZNaglowka(email.references)],
    data: data && !Number.isNaN(data.getTime()) ? data : null,
    naglowki: email.headers.map((h) => ({ key: h.key, value: bezNul(h.value) })),
    // Surowy nagłówek: „<>” (zwrotka) parser adresów gubi.
    returnPath: email.headers.find((h) => h.key === 'return-path')?.value ?? null,
  };
}

/**
 * Data otrzymania do zapisu: z nagłówka Date tylko, gdy jest wiarygodna (ostatni rok, nie z przyszłości). Inaczej
 * teraz — nagłówek ustawia nadawca: rok -10000 przekraczał zakres TIMESTAMP w PostgreSQL (błąd zapisu przy każdym
 * przebiegu), a data z przyszłości trzymała mail na górze kolejki. Przegląd F3.7.
 */
export function dataOtrzymania(data: Date | null, teraz: Date): Date {
  if (!data) return teraz;
  const t = data.getTime();
  return t >= teraz.getTime() - 366 * 86_400_000 && t <= teraz.getTime() + 86_400_000 ? data : teraz;
}

/** Cała wiadomość: podstawy + treść bez cytatu + bezpieczne załączniki (reszta na liście pominiętych). */
export async function parsujMail(raw: Buffer): Promise<MailPrzychodzacy> {
  const email = await PostalMime.parse(raw, { attachmentEncoding: 'arraybuffer' });
  const zalaczniki: ZalacznikMaila[] = [];
  const pominiete: PominietyZalacznik[] = [];
  for (const a of email.attachments) {
    // Obrazki osadzone w HTML (stopka, logo) — część wyglądu maila, nie plik od klienta.
    if (a.disposition !== 'attachment' && (a.contentId || a.related)) continue;
    const nazwa = sanitizeOriginalFilename(a.filename || 'zalacznik');
    const tresc = Buffer.from(typeof a.content === 'string' ? Buffer.from(a.content) : new Uint8Array(a.content as ArrayBuffer));
    const ocena = ocenZalacznik(nazwa, tresc);
    if ('powod' in ocena) pominiete.push({ nazwa, powod: ocena.powod });
    else if (zalaczniki.length >= ZALACZNIKI_MAX) pominiete.push({ nazwa, powod: `ponad ${ZALACZNIKI_MAX} załączników` });
    else zalaczniki.push({ nazwa, typ: ocena.typ, tresc });
  }
  const surowy = email.text?.trim() ? email.text : htmlNaTekst(email.html ?? '');
  let tekst = odetnijCytat(bezNul(surowy).replace(/\r\n/g, '\n')).trim();
  if (tekst.length > TRESC_MAX_ZNAKOW) tekst = `${tekst.slice(0, TRESC_MAX_ZNAKOW)}\n\n[… treść ucięta — pełna wiadomość w skrzynce zespołu]`;
  return { ...podstawy(email), tekst, zalaczniki, pominiete };
}

/** Mail tylko w HTML: tekst bez znaczników (bloki → nowe linie, encje → znaki). Treść trafia do zgłoszenia jako tekst. */
export function htmlNaTekst(html: string): string {
  const NAZWANE: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return html
    .replace(/<(style|script|head)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h: string) => safeChar(Number.parseInt(h, 16)))
    .replace(/&#(\d{1,7});/g, (_, d: string) => safeChar(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => NAZWANE[n.toLowerCase()] ?? m)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const safeChar = (c: number) => (c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : '');

// ------------------------------------------------------------------ automaty i spam

const wartosc = (h: { key: string; value: string }[], k: string) => h.find((x) => x.key === k)?.value?.trim() ?? null;

/**
 * Automat (autoresponder, zwrotka, lista mailingowa, nasz własny adres) — bez zgłoszenia i bez odpowiedzi, żeby nie
 * było pętli maili (RFC 3834 §2 https://www.rfc-editor.org/rfc/rfc3834#section-2, Auto-Submitted §5).
 */
export function powodAutomatu(
  m: Pick<MailPrzychodzacy, 'naglowki' | 'nadawca' | 'returnPath'>,
  domenyWlasne: readonly string[],
): string | null {
  const h = m.naglowki;
  const auto = wartosc(h, 'auto-submitted');
  if (auto && !/^no\b/i.test(auto)) return `Auto-Submitted: ${auto.slice(0, 40)}`;
  const prec = wartosc(h, 'precedence');
  if (prec && /^(bulk|junk|list|auto_reply)\b/i.test(prec)) return `Precedence: ${prec.slice(0, 20)}`;
  if (wartosc(h, 'x-autoreply') || wartosc(h, 'x-autorespond')) return 'autoodpowiedź';
  if (wartosc(h, 'list-id') || wartosc(h, 'list-unsubscribe')) return 'lista mailingowa / newsletter';
  if (/multipart\/report/i.test(wartosc(h, 'content-type') ?? '')) return 'raport doręczenia (zwrotka)';
  if (m.returnPath !== null && /^<\s*>$/.test(m.returnPath.trim())) return 'zwrotka (pusty Return-Path)';
  if (!m.nadawca) return 'brak nadawcy';
  const [lokal, domena] = m.nadawca.split('@');
  if (/^(mailer-daemon|postmaster)$/i.test(lokal ?? '')) return 'zwrotka serwera poczty';
  if (domena && domenyWlasne.map((d) => d.toLowerCase()).includes(domena)) return 'nadawca z naszej domeny (pętla)';
  return null;
}

/**
 * Spam wg nagłówków dopisanych przez filtr na serwerze poczty zespołu (Rspamd, ops/rspamd/local.d/milter_headers.conf:
 * `spam_header = "X-Spam"`) i popularnych wariantów SpamAssassina. NIEZWERYFIKOWANE z dokumentacją Rspamd — sprawdzić na
 * t1, jaki nagłówek dostaje mail ponad progiem add_header (ops/rspamd/local.d/actions.conf).
 */
export function powodSpamu(naglowki: { key: string; value: string }[]): string | null {
  // Każde wystąpienie, nie pierwsze: nadawca może sam dopisać „X-Spam: No” nad nagłówkiem filtra (przegląd F3.7).
  for (const h of naglowki) {
    const v = h.value.trim();
    if ((h.key === 'x-spam' || h.key === 'x-spam-flag') && /^(yes|true)\b/i.test(v)) return `${h.key}: ${v.slice(0, 20)}`;
    if (h.key === 'x-spam-status' && /^yes\b/i.test(v)) return 'x-spam-status: Yes';
  }
  return null;
}

/** Nadawca na liście blokad: dokładny adres albo „@domena”. */
export function zablokowany(nadawca: string, wzorce: readonly string[]): string | null {
  const n = nadawca.toLowerCase();
  const domena = `@${n.split('@')[1] ?? ''}`;
  return wzorce.find((w) => w.toLowerCase() === n || w.toLowerCase() === domena) ?? null;
}

/** „jan@x.pl” albo „@x.pl” (małe litery) — inaczej null. */
export function normalizujWzorzec(w: string): string | null {
  const v = w.trim().toLowerCase();
  return /^([a-z0-9._%+-]{1,64})?@[a-z0-9.-]{1,253}\.[a-z]{2,}$/.test(v) ? v : null;
}

// ------------------------------------------------------------------ treść

/**
 * Odcina cytat poprzedniej wiadomości (odpowiedź z klienta pocztowego), żeby w wątku zgłoszenia była tylko nowa treść.
 * Rozpoznaje: „W dniu … napisał(a):” / „On … wrote:” (także zawinięte na dwie linie), „-----Original Message-----”,
 * blok Outlooka „Od:/From:” + „Wysłano:/Sent:”, a na końcu blok linii „>”. Gdy po odcięciu nic nie zostaje — cała treść.
 */
export function odetnijCytat(tekst: string): string {
  const linie = tekst.split('\n');
  let koniec = linie.length;
  for (let i = 0; i < linie.length; i++) {
    const l = linie[i].trim();
    const z2 = `${l} ${(linie[i + 1] ?? '').trim()}`;
    // „W dniu … napisał(a):”, Gmail „pon., 12 paź 2026 o 10:00 X <a@b> napisał(a):” (też na dwóch liniach), „On … wrote:”.
    const konczy = /(napisał\(a\)|napisała|napisał|pisze|wrote|schrieb|a écrit)\s*:$/i;
    const jedna = konczy.test(l);
    const dwie = !jedna && !!linie[i + 1]?.trim() && konczy.test(z2);
    if ((jedna || dwie) && /\d/.test(jedna ? l : z2)) {
      const dalej = linie.slice(i + (dwie ? 2 : 1)).find((x) => x.trim());
      if (/^(W dniu|Dnia|On|Am|Le)\b/i.test(l) || (dalej !== undefined && /^\s*>/.test(dalej))) {
        koniec = i;
        break;
      }
    }
    if (/^-{2,}\s*(Original Message|Oryginalna wiadomość|Wiadomość oryginalna|Forwarded message|Wiadomość przekazana dalej)\s*-{2,}$/i.test(l)) {
      koniec = i;
      break;
    }
    if (/^(From|Od|Nadawca):\s+\S/i.test(l) && linie.slice(i + 1, i + 4).some((x) => /^(Sent|Wysłane|Wysłano|Wyslane|Wyslano|Data|Date):\s+\S/i.test(x.trim()))) {
      koniec = i;
      break;
    }
  }
  let wynik = linie.slice(0, koniec);
  // Blok cytatu „>” na końcu (np. odpowiedź nad cytatem bez nagłówka).
  // Linia „_____” przed blokiem Outlooka.
  while (wynik.length && (/^_{10,}\s*$/.test(wynik[wynik.length - 1]) || !wynik[wynik.length - 1].trim())) wynik.pop();
  let k = wynik.length;
  while (k > 0 && (/^\s*>/.test(wynik[k - 1]) || !wynik[k - 1].trim())) k--;
  if (k < wynik.length && wynik.slice(k).some((x) => /^\s*>/.test(x))) wynik = wynik.slice(0, k);
  const out = wynik.join('\n').trim();
  return out || tekst.trim();
}

/** Temat zgłoszenia z tematu maila: bez „Re:/Odp:/Fwd:/PD:” i bez naszego „[#xxxxxxxx]”. */
export function tematZgloszenia(temat: string): string {
  let t = temat;
  for (let i = 0; i < 5; i++) t = t.replace(/^\s*(re|odp|aw|fw|fwd|pd|wg)\s*(\[\d+\])?\s*:\s*/i, '').replace(/\[#[0-9a-f]{8}\]\s*/i, '');
  t = t.trim();
  return (t || 'Wiadomość e-mail').slice(0, 200);
}

// ------------------------------------------------------------------ załączniki

/**
 * Bezpieczne typy plików: rozszerzenie z listy i zgodna sygnatura treści (typ podany przez nadawcę się nie liczy).
 * Bez archiwów (ZIP może nieść plik wykonywalny), bez dokumentów z makrami i bez wykonywalnych. Brak skanu
 * antywirusowego — ryzyko opisane w raporcie F3.7.
 */
const SYGNATURY: Record<string, { typ: string; ok: (b: Buffer) => boolean }> = {
  pdf: { typ: 'application/pdf', ok: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  png: { typ: 'image/png', ok: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  jpg: { typ: 'image/jpeg', ok: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { typ: 'image/jpeg', ok: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  gif: { typ: 'image/gif', ok: (b) => /^GIF8[79]a$/.test(b.subarray(0, 6).toString('latin1')) },
  webp: { typ: 'image/webp', ok: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  txt: { typ: 'text/plain', ok: (b) => !b.includes(0) },
  log: { typ: 'text/plain', ok: (b) => !b.includes(0) },
  csv: { typ: 'text/csv', ok: (b) => !b.includes(0) },
};

export function ocenZalacznik(nazwa: string, tresc: Buffer): { typ: string } | { powod: string } {
  if (!tresc.length) return { powod: 'pusty plik' };
  if (tresc.length > ZALACZNIK_MAX_BAJTOW) return { powod: `większy niż ${ZALACZNIK_MAX_BAJTOW / 1024 / 1024} MB` };
  const czesci = nazwa.toLowerCase().split('.');
  const ext = czesci.length > 1 ? czesci[czesci.length - 1] : '';
  const s = SYGNATURY[ext];
  if (!s) return { powod: 'niedozwolony typ pliku' };
  if (!s.ok(tresc)) return { powod: 'treść nie pasuje do rozszerzenia' };
  return { typ: s.typ };
}
