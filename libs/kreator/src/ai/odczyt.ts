import { KATALOG_EFEKTOW, KATALOG_WARIANTOW, SEKCJE_PRO } from '../katalog.ts';
import { migrujModel, Sekcja, walidujStrone, type Strona, type WynikWalidacji } from '../model.ts';
import { PLANY_KREATORA, type WersjaKreatora } from '../plany.ts';
import { czyFontWKatalogu, stylDlaWersji, stylPoId } from '../style/katalog-stylow.ts';
import { korygujPalete } from '../style/kolory.ts';
import type { BriefStrony, WiadomoscAi } from './kontrakt.ts';

/**
 * Odczyt odpowiedzi modelu: wyciągnięcie JSON, sprzątanie typografii, walidacja schematem, zasady treści
 * (opinie, ceny, dane kontaktowe, frazesy), zgodność z wersją kreatora i korekta palety do WCAG AA.
 * Błędy wracają jako krótkie ścieżki – nadają się do jednej rundy naprawy (`wiadomosciNaprawy`).
 */

type WynikJson = { ok: true; dane: unknown } | { ok: false; blad: string };

/** JSON z odpowiedzi: czysty, w płotkach ```json … ``` albo otoczony tekstem (od pierwszej „{” do ostatniej „}”). */
export function wyciagnijJson(tekst: string): WynikJson {
  let t = tekst.trim();
  const plot = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (plot) t = plot[1].trim();
  if (!t.startsWith('{')) {
    const od = t.indexOf('{');
    const doo = t.lastIndexOf('}');
    if (od < 0 || doo <= od) return { ok: false, blad: '(korzeń): odpowiedź nie zawiera obiektu JSON' };
    t = t.slice(od, doo + 1);
  }
  try {
    return { ok: true, dane: JSON.parse(t) };
  } catch (e) {
    return { ok: false, blad: `(korzeń): niepoprawny JSON – ${(e as Error).message.slice(0, 160)}` };
  }
}

const PAUZA = /\s*\u2014\s*/g;
const EMOJI = /\p{Extended_Pictographic}️?/gu;

/** Pauza „—” → półpauza „–” ze spacjami, bez emoji. Rekurencyjnie po wszystkich tekstach; nie mutuje wejścia. */
export function oczyscTeksty<T>(dane: T): T {
  if (typeof dane === 'string') {
    return dane.replace(PAUZA, ' – ').replace(EMOJI, '').replace(/ {2,}/g, ' ').trim() as T;
  }
  if (Array.isArray(dane)) return dane.map((x) => oczyscTeksty(x)) as T;
  if (dane && typeof dane === 'object') {
    return Object.fromEntries(Object.entries(dane).map(([k, v]) => [k, oczyscTeksty(v)])) as T;
  }
  return dane;
}

/** Frazy, których nie przepuszczamy w nowym tekście od AI (twierdzenia bez pokrycia i najgorsze frazesy). */
export const FRAZY_ZAKAZANE: { wzor: RegExp; opis: string }[] = [
  { wzor: /lider(?:em|a|zy)? (?:rynku|branży)/i, opis: '„lider rynku” – twierdzenie bez pokrycia' },
  { wzor: /\bnr\.? ?1\b|\bnumer(?:em)? jeden\b/i, opis: '„nr 1” – twierdzenie bez pokrycia' },
  { wzor: /najlepsz\p{L}* w (?:mieście|polsce|regionie|okolicy)/iu, opis: '„najlepszy w mieście” – twierdzenie bez pokrycia' },
  { wzor: /100\s?% (?:zadowolon|skuteczn|gwarancj)/i, opis: '„100% zadowolonych” – twierdzenie bez pokrycia' },
  { wzor: /w dzisiejszych czasach/i, opis: 'frazes „w dzisiejszych czasach”' },
  { wzor: /kompleksow\p{L}* (?:rozwiąza|obsług)/iu, opis: 'frazes „kompleksowe rozwiązania/obsługa”' },
];

function wszystkieTeksty(dane: unknown, sciezka: string, wynik: [string, string][] = []): [string, string][] {
  if (typeof dane === 'string') wynik.push([sciezka, dane]);
  else if (Array.isArray(dane)) dane.forEach((x, i) => wszystkieTeksty(x, `${sciezka}.${i}`, wynik));
  else if (dane && typeof dane === 'object') {
    for (const [k, v] of Object.entries(dane)) wszystkieTeksty(v, sciezka ? `${sciezka}.${k}` : k, wynik);
  }
  return wynik;
}

/** Liczby z tekstu („1 200,50 zł”, „od 90 zł”, „110–150”) jako wartości liczbowe. */
export function liczbyZTekstu(tekst: string): number[] {
  const m = tekst.match(/\d{1,3}(?:[  ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g) ?? [];
  return m.map((x) => Number(x.replace(/[  ]/g, '').replace(',', '.')));
}

const zaokr = (x: number) => Math.round(x * 100) / 100;

function cenaZBriefu(cena: number, dozwolone: number[]): boolean {
  return dozwolone.some((d) => Math.abs(d - cena) < 0.005 || Math.abs(zaokr(d * 1.23) - cena) < 0.015 || Math.abs(zaokr(d / 1.23) - cena) < 0.015 || Math.abs(Math.round(d * 1.23) - cena) < 0.005);
}

const kluczOpinii = (w: { autor: string; tresc: string }) => `${w.autor}\u0000${w.tresc}`;

export interface OpcjeZasad {
  tryb: 'generacja' | 'zmiana';
  /** Strona przed zmianą – w trybie zmiany sprawdzamy tylko nową treść. */
  poprzednia?: Strona;
  /** Brief generacji – ceny spoza briefu są błędem. */
  brief?: BriefStrony;
}

/**
 * Zasady treści, których nie wyrazi schemat: opinie tylko od klienta, ceny tylko z briefu, linki tel:/mailto:
 * tylko z danymi z briefu, bez twierdzeń typu „lider rynku”. Zwraca listę błędów (pusta = w porządku).
 *
 * Ceny: każda liczba w `oferta.pozycje[].cena`, `cennik.pakiety[].cenaBrutto/cenaNetto` i `produkty[].cenaBrutto`
 * musi wystąpić w briefie (pole `ceny` albo opis); dopuszczamy przeliczenie netto↔brutto o 23% VAT.
 */
export function sprawdzZasadyTresci(strona: Strona, opcje: OpcjeZasad): string[] {
  const bledy: string[] = [];
  const stareTeksty = new Set(opcje.poprzednia ? wszystkieTeksty(opcje.poprzednia, '').map(([, t]) => t) : []);
  const stareOpinie = new Set(
    (opcje.poprzednia?.strony ?? []).flatMap((p) => p.sekcje).flatMap((s) => (s.typ === 'opinie' ? s.dane.wpisy.map(kluczOpinii) : [])),
  );
  const ceny = opcje.tryb === 'generacja' && opcje.brief ? liczbyZTekstu(`${opcje.brief.ceny ?? ''} ${opcje.brief.opis}`) : null;
  const kontaktyBriefu = opcje.brief ? tekstBriefu(opcje.brief) : null;

  strona.strony.forEach((p, i) =>
    p.sekcje.forEach((s, j) => {
      const sc = `strony.${i}.sekcje.${j}`;
      if (s.typ === 'opinie') {
        const nowe = s.dane.wpisy.filter((w) => opcje.tryb === 'generacja' || !stareOpinie.has(kluczOpinii(w)));
        if (nowe.length) bledy.push(`${sc}.dane.wpisy: opinie wpisuje wyłącznie klient – zostaw wpisy: [] (bez nowych opinii)`);
      }
      if (ceny) {
        const sprawdz = (sciezka: string, wartosci: number[]) => {
          const obce = wartosci.filter((x) => !cenaZBriefu(x, ceny));
          if (obce.length) bledy.push(`${sciezka}: cena ${obce.join(', ')} nie występuje w briefie – pomiń cenę albo użyj null`);
        };
        if (s.typ === 'oferta') s.dane.pozycje.forEach((x, k) => x.cena && sprawdz(`${sc}.dane.pozycje.${k}.cena`, liczbyZTekstu(x.cena)));
        if (s.typ === 'cennik') {
          s.dane.pakiety.forEach((x, k) => {
            if (x.cenaBrutto !== null) sprawdz(`${sc}.dane.pakiety.${k}.cenaBrutto`, [x.cenaBrutto]);
            if (x.cenaNetto !== undefined) sprawdz(`${sc}.dane.pakiety.${k}.cenaNetto`, [x.cenaNetto]);
          });
        }
        if (s.typ === 'produkty') s.dane.produkty.forEach((x, k) => sprawdz(`${sc}.dane.produkty.${k}.cenaBrutto`, [x.cenaBrutto]));
      }
      if (kontaktyBriefu) {
        const przyciski = s.typ === 'hero' || s.typ === 'cta' ? s.dane.przyciski : [];
        przyciski.forEach((b, k) => {
          if (!linkZBriefu(b.cel, kontaktyBriefu)) bledy.push(`${sc}.dane.przyciski.${k}.cel: numer lub e-mail spoza briefu – użyj '#kontakt'`);
        });
      }
    }),
  );

  for (const [sciezka, tekst] of wszystkieTeksty(strona, '')) {
    // Dane firmy (adres „lok. nr 1”, nazwa) pochodzą z briefu – frazesów szukamy w treściach.
    if (stareTeksty.has(tekst) || sciezka.startsWith('firma.')) continue;
    for (const f of FRAZY_ZAKAZANE) if (f.wzor.test(tekst)) bledy.push(`${sciezka}: ${f.opis} – usuń`);
  }
  return bledy;
}

const cyfry = (s: string) => s.replace(/\D/g, '');

function tekstBriefu(b: BriefStrony): string {
  return `${b.opis}\n${b.ceny ?? ''}\n${b.inspiracje ?? ''}\n${JSON.stringify(b.firma ?? {})}`.toLocaleLowerCase('pl-PL');
}

function telefonyZTekstu(t: string): string[] {
  return (t.match(/\+?\d[\d \-()]{5,}\d/g) ?? []).map(cyfry);
}

function telefonZBriefu(tel: string, brief: string): boolean {
  const c = cyfry(tel);
  return c.length >= 6 && telefonyZTekstu(brief).some((x) => x === c || x.endsWith(c) || c.endsWith(x));
}

function linkZBriefu(cel: string, brief: string): boolean {
  if (/^tel:/i.test(cel)) return telefonZBriefu(cel.slice(4), brief);
  if (/^mailto:/i.test(cel)) return brief.includes(cel.slice(7).split('?')[0].toLocaleLowerCase('pl-PL'));
  return true;
}

/** Usuwa z danych firmy kontakty, których nie ma w briefie (AI nie wymyśla telefonu, adresu ani NIP). */
export function usunKontaktySpozaBriefu(strona: Strona, brief: BriefStrony): Strona {
  const t = tekstBriefu(brief);
  const kopia = structuredClone(strona);
  const f = kopia.firma;
  if (f.telefon && !telefonZBriefu(f.telefon, t)) delete f.telefon;
  if (f.email && !t.includes(f.email.toLocaleLowerCase('pl-PL'))) delete f.email;
  if (f.nip && !cyfry(t).includes(f.nip)) delete f.nip;
  if (f.adres && !(brief.firma?.adres || t.includes(f.adres.ulica.toLocaleLowerCase('pl-PL').replace(/^ul\.\s*/, '')))) delete f.adres;
  f.social = f.social.filter((s) => t.includes(s.url.toLocaleLowerCase('pl-PL').replace(/\/$/, '')));
  if (f.godziny.length && !brief.firma?.godziny?.length && !/\d{1,2}[:.]\d{2}|\d{1,2}\s*[–-]\s*\d{1,2}/.test(t)) f.godziny = [];
  return kopia;
}

const WARIANTY = new Map(Object.values(KATALOG_WARIANTOW).flat().map((w) => [w.id, w] as const));
const EFEKTY = new Map(KATALOG_EFEKTOW.map((e) => [e.id, e] as const));

/** Identyfikatory spoza katalogów: nieznany styl i wariant to błąd (renderer ich nie zna); nieznany efekt znika, font spoza katalogu – para stylu. */
export function sprawdzKatalogi(strona: Strona): { strona: Strona; bledy: string[] } {
  const bledy: string[] = [];
  const kopia = structuredClone(strona);
  const styl = stylPoId(kopia.motyw.styl);
  if (!styl) bledy.push(`motyw.styl: nieznany styl „${kopia.motyw.styl}” – użyj stylu z katalogu`);
  kopia.strony.forEach((p, i) =>
    p.sekcje.forEach((s, j) => {
      if (!KATALOG_WARIANTOW[s.typ].some((w) => w.id === s.wariant)) {
        bledy.push(`strony.${i}.sekcje.${j}.wariant: „${s.wariant}” nie jest wariantem typu ${s.typ} (dozwolone: ${KATALOG_WARIANTOW[s.typ].map((w) => w.id).join(', ')})`);
      }
    }),
  );
  kopia.motyw.efekty = [...new Set(kopia.motyw.efekty.filter((e) => EFEKTY.has(e)))];
  if (styl) {
    if (!czyFontWKatalogu(kopia.motyw.fonty.naglowki) || !czyFontWKatalogu(kopia.motyw.fonty.tekst)) {
      kopia.motyw.fonty = { naglowki: styl.pary[0].naglowki, tekst: styl.pary[0].tekst, ...(styl.pary[0].akcent ? { akcent: styl.pary[0].akcent } : {}) };
    }
    if (kopia.motyw.fonty.akcent && !czyFontWKatalogu(kopia.motyw.fonty.akcent)) delete kopia.motyw.fonty.akcent;
  }
  return { strona: kopia, bledy };
}

/**
 * Zgodność z wersją kreatora bez Pro – jak `dopasujDoPlanu`, ale tylko dla elementów NOWYCH względem
 * `poprzednia` (przy generacji: wszystkich). Elementy Pro, które klient sam ustawił w edytorze jako podgląd,
 * zostają – zastąpi je publikacja. Styl Pro → zastępczy, wariant Pro → darmowy odpowiednik, sekcje
 * sklepu/bloga i efekty Pro znikają, animacje „wyraziste” → „subtelne”, znak „minimalny” → „jasny”.
 */
export function dopasujDoWersji(strona: Strona, wersja: WersjaKreatora, poprzednia: Strona | null): Strona {
  const plan = PLANY_KREATORA[wersja];
  const kopia = structuredClone(strona);
  if (plan.funkcjePro) return kopia;
  const p = poprzednia;
  const stareWarianty = new Map((p?.strony ?? []).flatMap((x) => x.sekcje).map((s) => [s.id, s.wariant] as const));
  const stareTypy = new Set((p?.strony ?? []).flatMap((x) => x.sekcje).map((s) => `${s.id}|${s.typ}`));

  if (kopia.motyw.styl !== p?.motyw.styl) {
    const s = stylDlaWersji(kopia.motyw.styl, false);
    if (s) kopia.motyw.styl = s.id;
  }
  for (const podstrona of kopia.strony) {
    podstrona.sekcje = podstrona.sekcje.filter((s) => !SEKCJE_PRO.includes(s.typ) || stareTypy.has(`${s.id}|${s.typ}`));
    for (const s of podstrona.sekcje) {
      const w = WARIANTY.get(s.wariant);
      if (w?.pro && w.zastepczy && stareWarianty.get(s.id) !== s.wariant) s.wariant = w.zastepczy;
    }
  }
  const stareEfekty = new Set(p?.motyw.efekty ?? []);
  kopia.motyw.efekty = kopia.motyw.efekty.filter((e) => !EFEKTY.get(e)?.pro || stareEfekty.has(e));
  if (kopia.motyw.animacje === 'wyraziste' && p?.motyw.animacje !== 'wyraziste') kopia.motyw.animacje = 'subtelne';
  if (kopia.stopka.znakKreatora === 'minimalny' && p?.stopka.znakKreatora !== 'minimalny') kopia.stopka.znakKreatora = 'jasny';
  if (!p) {
    kopia.jezykiDodatkowe = [];
    if (plan.podstron !== null && kopia.strony.length > plan.podstron) kopia.strony = kopia.strony.slice(0, plan.podstron);
  }
  return kopia;
}

/** Wspólny koniec odczytu: katalogi, zasady treści, wersja, paleta AA, walidacja końcowa. */
function dokoncz(strona: Strona, wersja: WersjaKreatora, opcje: OpcjeZasad): WynikWalidacji {
  const kat = sprawdzKatalogi(strona);
  const bledy = [...kat.bledy, ...sprawdzZasadyTresci(kat.strona, opcje)];
  if (bledy.length) return { ok: false, bledy: bledy.slice(0, 40) };
  let wynik = kat.strona;
  if (opcje.tryb === 'generacja' && opcje.brief) wynik = usunKontaktySpozaBriefu(wynik, opcje.brief);
  wynik = dopasujDoWersji(wynik, wersja, opcje.poprzednia ?? null);
  wynik.motyw.paleta = korygujPalete(wynik.motyw.paleta).paleta;
  return walidujStrone(wynik);
}

export function odczytajWynikGeneracji(tekst: string, wersja: WersjaKreatora, brief?: BriefStrony): WynikWalidacji {
  const json = wyciagnijJson(tekst);
  if (!json.ok) return { ok: false, bledy: [json.blad] };
  const w = walidujStrone(migrujModel(oczyscTeksty(json.dane)));
  if (!w.ok) return w;
  return dokoncz(w.strona, wersja, { tryb: 'generacja', brief });
}

export function odczytajWynikZmiany(strona: Strona, tekst: string, sekcjaId: string | null, wersja: WersjaKreatora): WynikWalidacji {
  const json = wyciagnijJson(tekst);
  if (!json.ok) return { ok: false, bledy: [json.blad] };
  const dane = oczyscTeksty(json.dane);
  let nowa: Strona;
  if (sekcjaId === null) {
    const w = walidujStrone(migrujModel(dane));
    if (!w.ok) return w;
    nowa = w.strona;
  } else {
    const obiekt = (dane && typeof dane === 'object' && 'sekcja' in dane && !('typ' in dane) ? (dane as { sekcja: unknown }).sekcja : dane) as Record<string, unknown>;
    const sek = Sekcja.safeParse(obiekt && typeof obiekt === 'object' ? { ...obiekt, id: sekcjaId } : obiekt);
    if (!sek.success) return { ok: false, bledy: sek.error.issues.slice(0, 40).map((i) => `${i.path.join('.') || '(korzeń)'}: ${i.message}`) };
    nowa = structuredClone(strona);
    const podstrona = nowa.strony.find((p) => p.sekcje.some((s) => s.id === sekcjaId));
    if (!podstrona) return { ok: false, bledy: [`(korzeń): brak sekcji o id „${sekcjaId}”`] };
    podstrona.sekcje = podstrona.sekcje.map((s) => (s.id === sekcjaId ? sek.data : s));
    const w = walidujStrone(nowa);
    if (!w.ok) return w;
  }
  return dokoncz(nowa, wersja, { tryb: 'zmiana', poprzednia: strona });
}

/** Jedna runda naprawy: poprzednia odpowiedź modelu + lista błędów i prośba o poprawiony pełny JSON. */
export function wiadomosciNaprawy(odpowiedz: string, bledy: string[]): WiadomoscAi[] {
  const lista = bledy.slice(0, 40).map((b) => `- ${b}`).join('\n');
  return [
    { role: 'assistant', content: odpowiedz.trim() || '{}' },
    {
      role: 'user',
      content: `Odpowiedź nie przeszła walidacji. Błędy (ścieżka: problem):\n${lista}\n\nPopraw wyłącznie te miejsca, zachowaj resztę bez zmian i zwróć poprawioną, pełną odpowiedź w tym samym formacie (ten sam typ obiektu) – wyłącznie JSON, bez komentarzy i bez bloku kodu.`,
    },
  ];
}
