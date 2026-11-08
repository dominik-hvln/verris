import { renderujStrone, type Strona, type WersjaKreatora, type WynikRenderu } from '@verris/kreator';

/**
 * Render publikacji (paczka 121) – adapter do `renderujStrone` w trybie 'publikacja' (dopasujDoPlanu w środku).
 * Token DI jak RENDERER_KREATORA (zaleznosci.ts): testy podstawiają atrapę (np. render ze złośliwą ścieżką).
 */
export const RENDERER_PUBLIKACJI = Symbol('RENDERER_PUBLIKACJI');

export interface OpcjePublikacji {
  wersja: WersjaKreatora;
  /** https://domena – canonical, sitemap; brak = link podglądu i ZIP bez domeny. */
  adresStrony?: string;
  /** 'assets/fonty' (domena, ZIP) albo pełny adres proxy fontów API (link podglądu). */
  bazaFontow: string;
  noindex?: boolean;
  /** Adres POST formularza kontaktowego (…/kreator/formularz/<token>); brak = formularz wyłączony. */
  adresFormularza?: string;
  /** Paczka 122 – zdjęcia z biblioteki: 'assets/img/<id>-<szer>.<format>' (domena, ZIP) albo podpisany adres API. */
  adresZasobu?: (zasobId: string, szerokosc: number, format: 'webp' | 'jpg') => string;
}

export interface RendererPublikacji {
  renderuj(strona: Strona, opcje: OpcjePublikacji): WynikRenderu;
}

export function fabrykaRendereraPublikacji(): RendererPublikacji {
  return { renderuj: (strona, opcje) => renderujStrone(strona, { ...opcje, tryb: 'publikacja' }) };
}
