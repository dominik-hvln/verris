import { KATALOG_WARIANTOW } from '../../katalog.ts';
import type { Sekcja } from '../../model.ts';
import type { KontekstPodstrony, KontekstStrony } from '../kontekst.ts';
import { renderHero } from './hero.ts';
import { renderBlog, renderKontakt, renderProdukty } from './kontakt.ts';
import { opinieDoPokazania, renderGaleria, renderOpinie, renderZespol } from './media.ts';
import { renderCennik, renderOferta } from './oferta.ts';
import { renderCta, renderFaq, renderKroki, renderONas } from './tresc.ts';

/** Czy sekcja pojawia się na stronie (ukryte i puste opinie/blog w publikacji – nie). */
export function czyWidoczna(s: Pick<KontekstStrony, 'podglad'>, sek: Sekcja): boolean {
  if (sek.ukryta) return false;
  if (sek.typ === 'opinie') return opinieDoPokazania(s, sek);
  if (sek.typ === 'blog') return sek.dane.wpisy.length > 0 || s.podglad;
  return true;
}

/** Nieznany wariant (np. starszy model) → pierwszy wariant typu + ostrzeżenie. */
function zWariantem(s: KontekstStrony, sek: Sekcja): Sekcja {
  const warianty = KATALOG_WARIANTOW[sek.typ];
  if (warianty.some((w) => w.id === sek.wariant)) return sek;
  const zast = warianty[0]!.id;
  s.ostrzezenia.push(`Sekcja „${sek.id}”: nieznany układ „${sek.wariant}” – użyto „${zast}”.`);
  return { ...sek, wariant: zast } as Sekcja;
}

export function renderSekcji(k: KontekstPodstrony, wejscie: Sekcja): string {
  const sek = zWariantem(k.s, wejscie);
  switch (sek.typ) {
    case 'hero':
      return renderHero(k, sek);
    case 'oferta':
      return renderOferta(k, sek);
    case 'cennik':
      return renderCennik(k, sek);
    case 'galeria':
      return renderGaleria(k, sek);
    case 'zespol':
      return renderZespol(k, sek);
    case 'opinie':
      return renderOpinie(k, sek);
    case 'faq':
      return renderFaq(k, sek);
    case 'kroki':
      return renderKroki(k, sek);
    case 'onas':
      return renderONas(k, sek);
    case 'kontakt':
      return renderKontakt(k, sek);
    case 'cta':
      return renderCta(k, sek);
    case 'produkty':
      return renderProdukty(k, sek);
    case 'blog':
      return renderBlog(k, sek);
  }
}
