import { funkcjeAiKreatora, renderujStrone, type FunkcjeAiKreatora, type Strona, type WersjaKreatora } from '@verris/kreator';

/**
 * Zależności kreatora z @verris/kreator wstrzykiwane przez tokeny DI: master prompt (FunkcjeAiKreatora, libs/kreator/src/ai)
 * i renderer (libs/kreator/src/render). Serwis programuje względem interfejsów, testy podstawiają atrapy,
 * a fabryki niżej (podpięte w kreator.module.ts) dają implementacje z biblioteki.
 */
export const FUNKCJE_AI_KREATORA = Symbol('FUNKCJE_AI_KREATORA');
export const RENDERER_KREATORA = Symbol('RENDERER_KREATORA');

/** Plik wyniku renderu (ścieżka względna w katalogu strony, np. 'index.html', 'o-nas/index.html', 'assets/styl.css'). */
export interface PlikRenderu {
  sciezka: string;
  tresc: string;
}

export interface OpcjeRenderuKreatora {
  tryb: 'podglad';
  wersja: WersjaKreatora;
  /** Podgląd elementów Pro w wersjach bez Pro (edytor pokazuje je ze wstęgą „Pro”). */
  podgladPro: boolean;
  /** Publiczny adres proxy fontów API (…/fonts) – odwiedzający nie łączy się z Google. */
  bazaFontow: string;
  /** Paczka 122 – podpisany adres pliku wariantu zdjęcia z biblioteki (…/kreator/z/<token>/<szer>.<format>). */
  adresZasobu?: (zasobId: string, szerokosc: number, format: 'webp' | 'jpg') => string;
}

/** Strona API renderera: model → pliki statycznej strony. Adapter do `renderujStrone` z @verris/kreator. */
export interface RendererKreatora {
  renderuj(strona: Strona, opcje: OpcjeRenderuKreatora): PlikRenderu[] | Promise<PlikRenderu[]>;
}

export function fabrykaFunkcjiAiKreatora(): FunkcjeAiKreatora {
  return funkcjeAiKreatora;
}

/** Podgląd zawsze z noindex (strona w edytorze nie jest stroną klienta w sieci). */
export function fabrykaRendereraKreatora(): RendererKreatora {
  return {
    renderuj: (strona, opcje) => renderujStrone(strona, { ...opcje, noindex: true }).pliki,
  };
}
