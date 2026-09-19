import { memoryStorage } from 'multer';
import { FileInterceptor } from '@nestjs/platform-express';

/**
 * SEC-07 — jedno miejsce, w którym stoją limity multipartu.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DLACZEGO TEN PLIK ISTNIEJE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 2026-09-19 bramka podatności zatrzymała PR #37 na trzech podatnościach HIGH
 * w multerze (CVSS 7.5, wektor sieciowy, BEZ uwierzytelnienia i bez interakcji
 * użytkownika). Każda z nich kończy proces Node jednym żądaniem
 * `multipart/form-data`. API przyjmuje uploady na dwóch ścieżkach — załączniki
 * do zgłoszeń i menedżer plików — więc obie były wystawione.
 *
 * Dwie z trzech znikają po podniesieniu multera do 2.3.0. Trzecia, GHSA-535w-7cp7-47q4,
 * NIE ZNIKA: advisory mówi wprost „upgrade to 2.3.0 **and** configure
 * limits.fieldArrayIndexLimit to the minimum array index their application
 * requires". Sama wersja nie wystarcza — trzeba dołożyć limit, którego domyślnie
 * nie ma. Atak polega na polu `items[4294967294]`, które wymusza alokację
 * maksymalnie długiej tablicy rzadkiej; kolejne pole z kluczem nieliczbowym
 * na tej samej bazie przelatuje ją w całości i zjada procesor synchronicznie.
 *
 * Gdyby limit stał wpisany osobno przy każdym interceptorze, mielibyśmy dwa
 * źródła jednej liczby i trzecie miejsce, o którym ktoś zapomni przy następnym
 * endpointcie z uploadem. To dokładnie ta usterka, którą X-33 opisał przy
 * oknie bramki alertów. Stąd ten moduł.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DLACZEGO JEST TU RZUTOWANIE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `multer` nie dostarcza własnych typów, a `@types/multer` stoi na 2.2.0 i nie
 * zna `fieldArrayIndexLimit` — pole `limits` jest tam typem literalnym wewnątrz
 * `interface Options`, więc nie da się go rozszerzyć deklaracją. Zostaje jedno
 * rzutowanie, zamknięte w tym pliku i niepowtarzane nigdzie indziej.
 *
 * To jest dokładnie sytuacja z X-21: deklaracje typów opisują inną wersję
 * biblioteki niż ta zainstalowana. Strażnik `multer-limity.spec.ts` pilnuje,
 * żeby rzutowanie ZNIKNĘŁO, gdy tylko `@types/multer` nauczy się tego pola —
 * obejście z terminem, nie obejście na zawsze.
 */

/** Typ opcji, który przyjmuje `FileInterceptor` / `FilesInterceptor`. */
type OpcjeInterceptora = NonNullable<Parameters<typeof FileInterceptor>[1]>;

/**
 * Najwyższy dopuszczalny indeks w nazwie pola typu `items[n]`.
 *
 * Prawdziwym minimum dla tego API jest zero — ani załączniki zgłoszeń, ani
 * menedżer plików nie używają notacji nawiasowej. Zostaje 10, żeby klient
 * wysyłający legalnie `x[0]`…`x[9]` nie dostał błędu przy zmianie, której nie
 * zapowiedzieliśmy. Atak potrzebuje indeksu rzędu 4 294 967 294, więc każdy
 * mały limit go zamyka; różnica między 0 a 10 nie ma znaczenia dla podatności,
 * a ma dla zgodności wstecznej.
 */
export const MAKS_INDEKS_TABLICY_W_POLU = 10;

/**
 * Opcje uploadu do pamięci z limitem rozmiaru i twardym limitem indeksu tablicy.
 * KAŻDY interceptor przyjmujący multipart w tym API ma przechodzić przez tę funkcję.
 */
export function opcjeUploaduDoPamieci(maksBajtow: number): OpcjeInterceptora {
  const opcje = {
    storage: memoryStorage(),
    limits: {
      fileSize: maksBajtow,
      fieldArrayIndexLimit: MAKS_INDEKS_TABLICY_W_POLU,
    },
  };

  // Jedyne rzutowanie — powód opisany w nagłówku pliku, pilnowany testem.
  return opcje as unknown as OpcjeInterceptora;
}
