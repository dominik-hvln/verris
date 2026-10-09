import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { OBIEKTY_ASYSTENTA, POMOC, type KontekstAsystentaDto, type PomocId, type WpisPomocy } from '@verris/contracts';

/**
 * Wiedza asystenta AI pracowników (propozycja 10.10, sekcja D, patch 7): słownik pomocy „?” panelu admina
 * (libs/contracts/src/pomoc-admina.ts) i biała lista runbooków z docs/ops, synchronizowane do indeksu jako
 * dokumenty audience=STAFF (KnowledgeBaseService.synchronizujWiedzeStaff, przy starcie API).
 *
 * Decyzja właściciela 10.10: do indeksu tylko treści BEZ sekretów, adresów IP i danych klientów — incydenty
 * (INCIDENT_*), zgłoszenia abuse (HETZNER_ABUSE_*) i podobne nigdy. Każdy plik z listy przeszedł przegląd
 * (10.10), a `powodWrazliwosci` sprawdza treść jeszcze raz przy każdej synchronizacji: dopisanie IP albo
 * adresu e-mail do runbooka wyłącza go z indeksu zamiast wysłać do dostawcy AI.
 */

export const FUNKCJE_POMOCY = Object.keys(POMOC) as PomocId[];
export { OBIEKTY_ASYSTENTA };

/** Pliki z docs/ops dla asystenta pracowników — każdy dopisany plik wymaga też COPY w Dockerfile.api. */
export const RUNBOOKI_STAFF_AI: readonly { plik: string; tytul: string }[] = [
  { plik: 'SUPPORT_MODEL_24-7.md', tytul: 'Model wsparcia: poziomy obsługi i czasy odpowiedzi (SLA)' },
  { plik: 'EMAIL_DELIVERABILITY_WARMUP.md', tytul: 'Dostarczalność poczty: rozgrzewanie IP i reakcja na listę RBL' },
  { plik: 'BETA_TESTY.md', tytul: 'Testy beta: zaproszenia, kody i zgłoszenia testerów' },
];

/** Nigdy do indeksu: incydenty, abuse, sekrety i testy bezpieczeństwa, dostęp SSH, dzienniki wdrożeń. */
export const ZAKAZANE_RUNBOOKI =
  /^(INCIDENT|HETZNER_ABUSE|SECRET|SECURITY|PLAN_TESTOW_CYBER|WAF_HARDENING|CURSOR_DEPLOY_SSH|WDROZENIE_|OVH_DNS)/;

const WRAZLIWE: { powod: string; re: RegExp }[] = [
  { powod: 'adres IPv4', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/ },
  // Co najmniej 5 grup albo skrót „::” — godziny (10:30:00) i wersje nie pasują.
  { powod: 'adres IPv6', re: /(?<![\w:])(?=[0-9a-f:]*::|(?:[0-9a-f]{1,4}:){4})[0-9a-f]{1,4}(?::[0-9a-f]{0,4}){2,7}(?![\w:])/i },
  { powod: 'adres e-mail', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/ },
  { powod: 'klucz prywatny', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { powod: 'token lub klucz API', re: /\b(?:sk|rk|pk)_live_|\bwhsec_|\bghp_|\bxox[bp]-|\bAKIA[0-9A-Z]{16}\b|\beyJ[\w-]{10,}\.[\w-]{10,}/ },
  { powod: 'przypisany sekret', re: /\b[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY)[A-Z0-9_]*\s*=\s*['"]?[^\s'"$<{]{6,}/ },
];

/** Powód, dla którego tekst nie może trafić do indeksu asystenta, albo null. */
export function powodWrazliwosci(tekst: string): string | null {
  return WRAZLIWE.find((w) => w.re.test(tekst))?.powod ?? null;
}

export interface DokumentWiedzyStaff {
  sourceRef: string;
  sourceType: 'TEXT' | 'MARKDOWN';
  title: string;
  content: string;
}

function trescPomocy(w: WpisPomocy): string {
  return [w.tytul, w.opis, w.kiedy ? `Kiedy: ${w.kiedy}` : null, w.rozniSieOd ?? null].filter(Boolean).join('\n');
}

/**
 * Dokumenty do indeksu STAFF: wpisy słownika „?” i runbooki z białej listy. `czytaj` zwraca treść pliku
 * z docs/ops albo null (brak pliku w obrazie) — wtedy runbook jest pomijany, a reszta synchronizuje się dalej.
 */
export function dokumentyWiedzyStaff(czytaj: (plik: string) => string | null): {
  dokumenty: DokumentWiedzyStaff[];
  pominiete: { plik: string; powod: string }[];
} {
  const dokumenty: DokumentWiedzyStaff[] = [];
  const pominiete: { plik: string; powod: string }[] = [];
  for (const [id, wpis] of Object.entries(POMOC) as [PomocId, WpisPomocy][]) {
    const content = trescPomocy(wpis);
    const powod = powodWrazliwosci(content);
    if (powod) {
      pominiete.push({ plik: `pomoc:${id}`, powod });
      continue;
    }
    dokumenty.push({ sourceRef: `pomoc:${id}`, sourceType: 'TEXT', title: `Panel admina: ${wpis.tytul}`, content });
  }
  for (const r of RUNBOOKI_STAFF_AI) {
    if (ZAKAZANE_RUNBOOKI.test(r.plik)) {
      pominiete.push({ plik: r.plik, powod: 'plik z listy zakazanych' });
      continue;
    }
    const tresc = czytaj(r.plik)?.trim();
    if (!tresc) {
      pominiete.push({ plik: r.plik, powod: 'brak pliku' });
      continue;
    }
    const powod = powodWrazliwosci(tresc);
    if (powod) {
      pominiete.push({ plik: r.plik, powod });
      continue;
    }
    dokumenty.push({ sourceRef: `docs-ops:${r.plik}`, sourceType: 'MARKDOWN', title: r.tytul, content: tresc });
  }
  return { dokumenty, pominiete };
}

/** Prefiksy `sourceRef` dokumentów zarządzanych przez synchronizację (inne dokumenty STAFF zostają). */
export const PREFIKSY_WIEDZY_STAFF = ['pomoc:', 'docs-ops:'] as const;

/** Stałe ID dokumentu z `sourceRef` (format UUID) — kilka instancji API nie założy dwóch kopii. */
export function idDokumentuStaff(sourceRef: string): string {
  const h = createHash('sha1').update(`verris-wiedza-staff:${sourceRef}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Runbook z docs/ops: monorepo lokalnie albo /app/docs/ops w obrazie (Dockerfile.api). */
export function czytajRunbook(plik: string): string | null {
  if (!/^[A-Za-z0-9._-]+\.md$/.test(plik)) return null;
  const kandydaci = [
    join(process.cwd(), 'docs/ops', plik),
    join(process.cwd(), '../../docs/ops', plik),
    join(import.meta.dirname, '../../../docs/ops', plik),
    join(import.meta.dirname, '../../../../docs/ops', plik),
  ];
  for (const p of kandydaci) if (existsSync(p)) return readFileSync(p, 'utf8');
  return null;
}

const NAZWY_OBIEKTOW: Record<(typeof OBIEKTY_ASYSTENTA)[number], string> = {
  wezel: 'węzeł',
  klient: 'klient',
  usluga: 'usługa',
  faktura: 'faktura',
  zgloszenie: 'zgłoszenie',
  migracja: 'migracja',
  operator: 'operator',
};

/**
 * Fragment promptu z kontekstem pracownika. Pola przeszły walidację DTO (ścieżka, klucz słownika, typ
 * z listy, ID ze znaków [A-Za-z0-9_-]), więc nie niosą wolnego tekstu. Danych obiektu nie pobieramy —
 * asystent zna tylko jego typ i ID, więc nie ujawni niczego spoza uprawnień pracownika.
 */
export function opisKontekstuPracownika(k: KontekstAsystentaDto): string[] {
  const linie = [`Pracownik jest na stronie panelu admina: ${k.strona}`];
  const wpis = k.funkcja && k.funkcja in POMOC ? POMOC[k.funkcja as PomocId] : null;
  if (wpis) linie.push(`Pyta o funkcję „${wpis.tytul}”: ${trescPomocy(wpis).split('\n').slice(1).join(' ')}`);
  if (k.obiektTyp && k.obiektId) linie.push(`Otwarta karta: ${NAZWY_OBIEKTOW[k.obiektTyp]} (ID ${k.obiektId}).`);
  linie.push('Prowadź krok po kroku po elementach panelu admina: zakładka, sekcja, przycisk.');
  return linie;
}

/** Tytuł funkcji ze słownika — dokłada go do zapytania wyszukiwania w bazie wiedzy. */
export function tytulFunkcji(funkcja: string | undefined): string | null {
  return funkcja && funkcja in POMOC ? POMOC[funkcja as PomocId].tytul : null;
}
