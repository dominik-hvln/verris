import { KATALOG_EFEKTOW, KATALOG_WARIANTOW, SEKCJE_PRO } from './katalog.ts';
import type { Strona } from './model.ts';

/**
 * Wersje kreatora (decyzja właściciela 2026-11-07):
 *  - proba   – okres próbny hostingu: podgląd bez własnej domeny, noindex, bez ZIP i WordPressa;
 *  - hosting – kreator w cenie hostingu: własna domena, ZIP, przejście na WordPressa;
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
  wielojezycznosc: boolean;
  znakMinimalny: boolean;
}

export const PLANY_KREATORA: Record<WersjaKreatora, PlanKreatora> = {
  proba: {
    nazwa: 'Okres próbny', stron: 1, podstron: 5, generacjiMies: 1, zmianAiMies: 20, wariantyGeneracji: 1, prompt: 'lite',
    funkcjePro: false, seo: 'podstawowe', publikacja: 'podglad', zip: false, wordpress: false, wielojezycznosc: false, znakMinimalny: false,
  },
  hosting: {
    nazwa: 'W cenie hostingu', stron: 3, podstron: 5, generacjiMies: 3, zmianAiMies: 200, wariantyGeneracji: 1, prompt: 'lite',
    funkcjePro: false, seo: 'podstawowe', publikacja: 'domena', zip: true, wordpress: true, wielojezycznosc: false, znakMinimalny: false,
  },
  pro: {
    nazwa: 'Kreator Pro', stron: 10, podstron: null, generacjiMies: 10, zmianAiMies: 1000, wariantyGeneracji: 3, prompt: 'pro',
    funkcjePro: true, seo: 'pelne', publikacja: 'domena', zip: true, wordpress: true, wielojezycznosc: true, znakMinimalny: true,
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
  { id: 'seo', nazwa: 'Pełne SEO', opis: 'Dane strukturalne FAQ, produktów, artykułów i nawigacji okruszkowej, przegląd SEO przez AI.' },
  { id: 'jezyki', nazwa: 'Wersje językowe', opis: 'Do trzech dodatkowych języków z poprawnym hreflang.' },
  { id: 'limity', nazwa: 'Wyższe limity', opis: '10 stron, podstrony bez limitu, 10 generacji i 1000 zmian AI miesięcznie.' },
  { id: 'znak', nazwa: 'Dyskretny znak w stopce', opis: 'Minimalna wersja znaku „Stworzone w Verris Kreator”.' },
];

const WARIANTY_PRO = new Map(
  Object.values(KATALOG_WARIANTOW)
    .flat()
    .filter((w) => w.pro)
    .map((w) => [w.id, w.zastepczy ?? null] as const),
);
const EFEKTY_PRO = new Set(KATALOG_EFEKTOW.filter((e) => e.pro).map((e) => e.id));

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
  const efekty = kopia.motyw.efekty.filter((e) => !EFEKTY_PRO.has(e));
  if (efekty.length < kopia.motyw.efekty.length) zmiany.push('Efekty Pro wyłączone (karuzele, powiększanie, paralaksa itp.)');
  kopia.motyw.efekty = efekty;
  if (kopia.motyw.animacje === 'wyraziste') {
    kopia.motyw.animacje = 'subtelne';
    zmiany.push('Animacje złagodzone do poziomu „subtelne”');
  }
  if (kopia.jezykiDodatkowe.length) {
    zmiany.push('Dodatkowe wersje językowe wyłączone');
    kopia.jezykiDodatkowe = [];
  }
  if (!plan.znakMinimalny && kopia.stopka.znakKreatora === 'minimalny') kopia.stopka.znakKreatora = 'jasny';
  return { strona: kopia, zmiany: [...new Set(zmiany)] };
}
