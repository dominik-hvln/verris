import { BladDostawcy, hostDozwolony, pobierzPlik, type Fetch } from '../biblioteka/dostawca.js';
import { BladGeneratora, MAKS_BAJTOW_WYNIKU, WYMIARY_BFL, blad, type GeneratorObrazow, type WygenerowanyObraz, type WynikGeneracji, type ZlecenieObrazow } from './generator.js';

/**
 * Black Forest Labs FLUX – https://docs.bfl.ai (do sprawdzenia z dokumentacją przy wdrożeniu; opis wg stanu wiedzy):
 *  - POST https://api.bfl.ai/v1/<model> (np. `flux-pro-1.1`, `flux-pro-1.1-ultra`, `flux-dev`), nagłówek `x-key`,
 *    body { prompt, width, height, output_format, safety_tolerance, prompt_upsampling } → { id, polling_url };
 *    429 = za dużo aktywnych zadań na koncie (limit ok. 24), 402 = brak kredytów.
 *  - GET polling_url (nagłówek `x-key`) → { status: 'Pending' | 'Ready' | 'Request Moderated' | 'Content Moderated'
 *    | 'Error' | 'Task not found', result: { sample: <URL obrazu> } }. Adres wyniku jest TYMCZASOWY (ok. 10 min) –
 *    obraz pobieramy od razu na serwer (import do magazynu Verris), strona nigdy go nie linkuje.
 *  - Moderacja: dostawca odrzuca polecenie („Request Moderated”) albo gotowy obraz („Content Moderated”).
 *  - Region: jest też punkt `api.eu.bfl.ai` (przetwarzanie w UE) – wybór przy wdrożeniu razem z umową powierzenia.
 *  - Cena: FLUX1.1 [pro] ok. 0,04 USD za obraz (stała w konfiguracji kreatora, ustawiana w adminie).
 * Jedno zlecenie = jeden obraz; warianty idą równolegle. Hosty pobierania: tylko *.bfl.ai (polling i plik wyniku).
 */
export const API_BFL = 'https://api.bfl.ai';
export const HOSTY_BFL = ['api.bfl.ai', '*.bfl.ai'] as const;
/** Odstęp odpytywania wyniku (BFL zaleca ok. 0,5–1 s). */
export const ODSTEP_ODPYTYWANIA_MS = 1000;

const MODEL_RE = /^flux-[a-z0-9.-]{1,40}$/;

interface OdpowiedzZlecenia {
  id?: unknown;
  polling_url?: unknown;
}
interface OdpowiedzWyniku {
  status?: unknown;
  result?: { sample?: unknown } | null;
}

const czekajDomyslnie = (ms: number, sygnal: AbortSignal) =>
  new Promise<void>((ok, nie) => {
    if (sygnal.aborted) return nie(sygnal.reason);
    const t = setTimeout(() => {
      sygnal.removeEventListener('abort', przerwij);
      ok();
    }, ms);
    const przerwij = () => {
      clearTimeout(t);
      nie(sygnal.reason);
    };
    sygnal.addEventListener('abort', przerwij, { once: true });
  });

export class GeneratorBfl implements GeneratorObrazow {
  readonly nazwa = 'bfl' as const;

  constructor(
    private readonly klucz: string | undefined,
    readonly f: Fetch = fetch,
    private readonly czekaj: (ms: number, sygnal: AbortSignal) => Promise<void> = czekajDomyslnie,
    private readonly baza = API_BFL,
  ) {}

  wlaczony(): boolean {
    return !!this.klucz;
  }

  async generuj(z: ZlecenieObrazow): Promise<WynikGeneracji> {
    if (!this.klucz) throw blad('wylaczony', 'brak BFL_API_KEY');
    if (!MODEL_RE.test(z.model)) throw blad('blad', `zły model ${z.model}`);
    const wyniki = await Promise.allSettled(Array.from({ length: z.ile }, () => this.jeden(z)));
    const obrazy: WygenerowanyObraz[] = [];
    let rozliczone = 0;
    let moderowane = 0;
    const bledy: BladGeneratora[] = [];
    for (const w of wyniki) {
      if (w.status === 'fulfilled') {
        obrazy.push(w.value);
        rozliczone += 1;
        continue;
      }
      const e = w.reason instanceof BladGeneratora ? w.reason : blad('blad', String(w.reason));
      rozliczone += e.rozliczone;
      if (e.kod === 'moderacja') moderowane += 1;
      bledy.push(e);
    }
    if (obrazy.length) return { obrazy, rozliczone, moderowane };
    // Żaden wariant: moderacja wszystkich → komunikat o zasadach; inaczej pierwszy „najważniejszy” błąd.
    const kolejnosc: BladGeneratora['kod'][] = ['moderacja', 'czas', 'limit', 'blad', 'wylaczony'];
    const glowny = [...bledy].sort((a, b) => kolejnosc.indexOf(a.kod) - kolejnosc.indexOf(b.kod))[0] ?? blad('blad');
    throw new BladGeneratora(glowny.kod, glowny.message, bledy.map((b) => b.szczegoly).join('; '), rozliczone);
  }

  /** Jedno zlecenie: wysłanie, odpytywanie do „Ready”, pobranie pliku. */
  private async jeden(z: ZlecenieObrazow): Promise<WygenerowanyObraz> {
    const { width, height } = WYMIARY_BFL[z.proporcje];
    let r: Response;
    try {
      r = await this.f(`${this.baza}/v1/${z.model}`, {
        method: 'POST',
        headers: { 'x-key': this.klucz!, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ prompt: z.prompt, width, height, output_format: 'jpeg', safety_tolerance: 2, prompt_upsampling: false }),
        redirect: 'error',
        signal: z.sygnal,
      });
    } catch (e) {
      throw z.sygnal.aborted ? blad('czas', 'BFL: termin przy zleceniu') : blad('blad', `BFL: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (r.status === 429) throw blad('limit', 'BFL HTTP 429');
    if (!r.ok) throw blad('blad', `BFL HTTP ${r.status}`);
    const zl = (await r.json().catch(() => null)) as OdpowiedzZlecenia | null;
    const polling = typeof zl?.polling_url === 'string' ? zl.polling_url : null;
    if (!polling || !hostDozwolony(polling, HOSTY_BFL)) throw blad('blad', `BFL: zły polling_url ${String(zl?.polling_url).slice(0, 200)}`);
    // Od tej chwili zlecenie jest przyjęte – dostawca je rozliczy, nawet jeśli potem zawiedzie.
    try {
      const sample = await this.odpytuj(polling, z.sygnal);
      const plik = await pobierzPlik(this.f, sample, HOSTY_BFL, MAKS_BAJTOW_WYNIKU, 30_000).catch((e: unknown) => {
        throw blad('blad', `BFL plik: ${e instanceof BladDostawcy ? e.szczegoly || e.message : String(e)}`);
      });
      return { dane: plik.dane };
    } catch (e) {
      const b = e instanceof BladGeneratora ? e : blad(z.sygnal.aborted ? 'czas' : 'blad', String(e));
      throw new BladGeneratora(b.kod, b.message, b.szczegoly, 1);
    }
  }

  private async odpytuj(url: string, sygnal: AbortSignal): Promise<string> {
    for (;;) {
      try {
        await this.czekaj(ODSTEP_ODPYTYWANIA_MS, sygnal);
      } catch {
        throw blad('czas', 'BFL: termin przy odpytywaniu');
      }
      let r: Response;
      try {
        r = await this.f(url, { headers: { 'x-key': this.klucz!, Accept: 'application/json' }, redirect: 'error', signal: sygnal });
      } catch (e) {
        throw sygnal.aborted ? blad('czas', 'BFL: termin przy odpytywaniu') : blad('blad', `BFL wynik: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (r.status === 429) continue; // za częste odpytywanie – następna próba po odstępie
      if (!r.ok) throw blad('blad', `BFL wynik HTTP ${r.status}`);
      const w = (await r.json().catch(() => null)) as OdpowiedzWyniku | null;
      const status = typeof w?.status === 'string' ? w.status : '';
      if (status === 'Ready') {
        const sample = w?.result?.sample;
        if (typeof sample !== 'string' || !hostDozwolony(sample, HOSTY_BFL)) throw blad('blad', `BFL: zły adres wyniku ${String(sample).slice(0, 200)}`);
        return sample;
      }
      if (status === 'Request Moderated' || status === 'Content Moderated') throw blad('moderacja', `BFL: ${status}`);
      if (status === 'Pending' || status === 'Queued' || status === 'Processing') continue;
      throw blad('blad', `BFL status: ${status || 'brak'}`);
    }
  }
}
