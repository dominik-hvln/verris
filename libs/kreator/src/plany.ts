import { KATALOG_EFEKTOW, KATALOG_WARIANTOW, SEKCJE_PRO } from './katalog.ts';
import { jezykPodstrony } from './jezyki.ts';
import type { Strona } from './model.ts';
import { KATALOG_STYLOW } from './style/katalog-stylow.ts';

/**
 * Wersje kreatora (decyzja właściciela 2026-11-07):
 *  - proba   – okres próbny hostingu: podgląd bez własnej domeny, noindex, bez ZIP;
 *  - hosting – kreator w cenie hostingu: własna domena, ZIP (przejście na WordPressa – etap 3, jeszcze niedostępne; flaga `wordpress` nic dziś nie włącza);
 *  - pro     – dodatek Kreator Pro: 9,90 zł brutto/mies. (8,05 netto) albo 99 zł brutto/rok (80,49 netto).
 * „Mała dawka” w wersjach bez Pro: lżejszy master prompt (prompt 'lite'), podstawowe efekty i warianty,
 * podstawowe SEO. Funkcje Pro widać w edytorze jako podgląd z oznaczeniem, publikacja je zastępuje.
 */
export type WersjaKreatora = 'proba' | 'hosting' | 'pro';
export const WERSJE_KREATORA: WersjaKreatora[] = ['proba', 'hosting', 'pro'];

export interface PlanKreatora {
  nazwa: string;
  /** Liczba stron (projektów) na konto. */
  stron: number;
  /** Podstrony w jednej stronie; null = bez limitu. */
  podstron: number | null;
  /** Generacje całej strony przez AI w miesiącu. */
  generacjiMies: number;
  /** Zmiany AI (sekcja, ton, tłumaczenie, przegląd) w miesiącu. */
  zmianAiMies: number;
  /** Ile propozycji projektu daje jedna generacja. */
  wariantyGeneracji: number;
  /** Wariant master promptu. */
  prompt: 'lite' | 'pro';
  funkcjePro: boolean;
  seo: 'podstawowe' | 'pelne';
  publikacja: 'podglad' | 'domena';
  zip: boolean;
  wordpress: boolean;
  /**
   * Wersje językowe strony (paczka 124): podstrony `<język>/…` z tłumaczeniem AI, hreflang, przełącznik języka.
   * Tylko Pro – bez Pro podstrony w językach dodatkowych nie są publikowane (`dopasujDoPlanu`).
   */
  wielojezycznosc: boolean;
  znakMinimalny: boolean;
  /** Miejsce na zdjęcia w bibliotece konta (suma oryginałów i wariantów w magazynie), MB. */
  miejsceZdjecMb: number;
  /** Paczka 124 – zdjęcia generowane przez AI w miesiącu (każdy wariant = jedno zdjęcie). */
  obrazowAiMies: number;
  /** Paczka 124 – ile wariantów daje jedno „Wygeneruj” (najwyżej tyle, ile zostało w limicie miesiąca). */
  wariantowObrazuAi: number;
}

export const PLANY_KREATORA: Record<WersjaKreatora, PlanKreatora> = {
  proba: {
    nazwa: 'Okres próbny', stron: 1, podstron: 5, generacjiMies: 1, zmianAiMies: 20, wariantyGeneracji: 1, prompt: 'lite',
    funkcjePro: false, seo: 'podstawowe', publikacja: 'podglad', zip: false, wordpress: false, wielojezycznosc: false, znakMinimalny: false,
    miejsceZdjecMb: 50, obrazowAiMies: 3, wariantowObrazuAi: 1,
  },
  hosting: {
    nazwa: 'W cenie hostingu', stron: 3, podstron: 5, generacjiMies: 3, zmianAiMies: 200, wariantyGeneracji: 1, prompt: 'lite',
    funkcjePro: false, seo: 'podstawowe', publikacja: 'domena', zip: true, wordpress: true, wielojezycznosc: false, znakMinimalny: false,
    miejsceZdjecMb: 500, obrazowAiMies: 20, wariantowObrazuAi: 2,
  },
  pro: {
    nazwa: 'Kreator Pro', stron: 10, podstron: null, generacjiMies: 10, zmianAiMies: 1000, wariantyGeneracji: 3, prompt: 'pro',
    funkcjePro: true, seo: 'pelne', publikacja: 'domena', zip: true, wordpress: true, wielojezycznosc: true, znakMinimalny: true,
    miejsceZdjecMb: 2048, obrazowAiMies: 100, wariantowObrazuAi: 4,
  },
};

/** Cennik dodatku. Netto = brutto / 1,23 zaokrąglone do grosza. */
export const CENA_KREATORA_PRO = { miesiacBrutto: 9.9, miesiacNetto: 8.05, rokBrutto: 99, rokNetto: 80.49 } as const;

/** Lista „co zyskujesz w Pro” – do panelu (porównanie, zablokowane elementy z opisem). */
export const KORZYSCI_PRO: { id: string; nazwa: string; opis: string }[] = [
  { id: 'warianty', nazwa: '3 propozycje projektu', opis: 'Każda generacja daje trzy różne kierunki do wyboru zamiast jednego.' },
  { id: 'prompt', nazwa: 'Pełny projekt AI', opis: 'Bogatsze układy, mocniejsza typografia i więcej sekcji dopasowanych do branży.' },
  { id: 'efekty', nazwa: 'Interakcje i animacje', opis: 'Karuzele, powiększanie zdjęć, paralaksa, przełącznik cen, animowany nagłówek.' },
  { id: 'sklep', nazwa: 'Katalog produktów', opis: 'Produkty z cenami i przyciskiem zakupu, dane produktowe dla Google.' },
  { id: 'blog', nazwa: 'Blog', opis: 'Wpisy z datą i czasem czytania, dane artykułów dla Google.' },
  { id: 'jezyki', nazwa: 'Wersje językowe', opis: 'Do 3 dodatkowych języków: angielski, niemiecki, ukraiński – tłumaczenie AI i przełącznik języka na stronie.' },
  { id: 'seo', nazwa: 'Pełne SEO', opis: 'Dane strukturalne FAQ, produktów, artykułów i nawigacji okruszkowej, przegląd SEO przez AI.' },
  { id: 'limity', nazwa: 'Wyższe limity', opis: '10 stron, podstrony bez limitu, 10 generacji i 1000 zmian AI miesięcznie.' },
  { id: 'znak', nazwa: 'Dyskretny znak w stopce', opis: 'Minimalna wersja znaku „Stworzone w Verris Kreator”.' },
  { id: 'zdjecia-ai', nazwa: 'Zdjęcia AI', opis: '100 zdjęć AI miesięcznie, 4 warianty do wyboru przy każdym generowaniu.' },
];

const WARIANTY_PRO = new Map(
  Object.values(KATALOG_WARIANTOW)
    .flat()
    .filter((w) => w.pro)
    .map((w) => [w.id, w.zastepczy ?? null] as const),
);
const EFEKTY_PRO = new Set(KATALOG_EFEKTOW.filter((e) => e.pro).map((e) => e.id));
const STYLE = new Map(KATALOG_STYLOW.map((s) => [s.id, s] as const));

export interface Dopasowanie {
  strona: Strona;
  /** Zmiany zrozumiałe dla klienta („Karuzela galerii zamieniona na mozaikę”). */
  zmiany: string[];
}

/**
 * Dopasowuje stronę do wersji kreatora przed publikacją: elementy Pro znikają albo dostają darmowy
 * odpowiednik. Edytor pokazuje `zmiany` jako „co tracisz bez Pro”. Czysta funkcja – nie mutuje wejścia.
 */
export function dopasujDoPlanu(strona: Strona, wersja: WersjaKreatora): Dopasowanie {
  const plan = PLANY_KREATORA[wersja];
  const kopia = structuredClone(strona);
  if (plan.funkcjePro) return { strona: kopia, zmiany: [] };
  const zmiany: string[] = [];

  // Wersje językowe (Pro) – najpierw, zanim limit podstron policzy podstrony w innych językach.
  if (!plan.wielojezycznosc) {
    const wJezykuGlownym = kopia.strony.filter((p) => jezykPodstrony(kopia, p) === kopia.jezyk);
    if (wJezykuGlownym.length < kopia.strony.length || kopia.jezykiDodatkowe.length) zmiany.push('Wersje językowe nieopublikowane (Kreator Pro)');
    kopia.strony = wJezykuGlownym;
    kopia.jezykiDodatkowe = [];
    delete kopia.stopka.tlumaczenia;
  }

  for (const p of kopia.strony) {
    const przed = p.sekcje.length;
    p.sekcje = p.sekcje.filter((s) => !SEKCJE_PRO.includes(s.typ));
    if (p.sekcje.length < przed) zmiany.push(`Podstrona „${p.tytul}”: sekcje sklepu i bloga ukryte (Kreator Pro)`);
    for (const s of p.sekcje) {
      if (WARIANTY_PRO.has(s.wariant)) {
        const zast = WARIANTY_PRO.get(s.wariant);
        if (zast) {
          zmiany.push(`Układ „${s.wariant}” zamieniony na „${zast}”`);
          s.wariant = zast;
        }
      }
    }
  }
  const bezBloga = kopia.strony.filter((p) => !p.slug.startsWith('blog/'));
  if (bezBloga.length < kopia.strony.length) zmiany.push('Wpisy bloga nieopublikowane (Kreator Pro)');
  kopia.strony = bezBloga;

  if (plan.podstron !== null && kopia.strony.length > plan.podstron) {
    zmiany.push(`Opublikowane tylko ${plan.podstron} pierwszych podstron`);
    kopia.strony = kopia.strony.slice(0, plan.podstron);
  }
  // Styl Pro → darmowy odpowiednik z katalogu. Zmienia się tylko identyfikator stylu (klasa w CSS strony);
  // paleta i fonty wybrane w projekcie zostają.
  const styl = STYLE.get(kopia.motyw.styl);
  if (styl?.pro && styl.zastepczy && STYLE.has(styl.zastepczy)) {
    zmiany.push(`Styl „${styl.nazwa}” zamieniony na „${STYLE.get(styl.zastepczy)!.nazwa}” (kolory i fonty zostają)`);
    kopia.motyw.styl = styl.zastepczy;
  }
  const efekty = kopia.motyw.efekty.filter((e) => !EFEKTY_PRO.has(e));
  if (efekty.length < kopia.motyw.efekty.length) zmiany.push('Efekty Pro wyłączone (karuzele, powiększanie, paralaksa itp.)');
  kopia.motyw.efekty = efekty;
  if (kopia.motyw.animacje === 'wyraziste') {
    kopia.motyw.animacje = 'subtelne';
    zmiany.push('Animacje złagodzone do poziomu „subtelne”');
  }
  if (!plan.znakMinimalny && kopia.stopka.znakKreatora === 'minimalny') kopia.stopka.znakKreatora = 'jasny';
  return { strona: kopia, zmiany: [...new Set(zmiany)] };
}
