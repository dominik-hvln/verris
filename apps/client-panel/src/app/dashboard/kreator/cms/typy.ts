/**
 * Paczka 124 – przejście strony z kreatora na CMS (dziś WordPress). Kształty odpowiedzi API
 * (apps/api/src/kreator/wordpress/kreator-wordpress.service.ts).
 */
export type StanCms = 'PODGLAD_W_TOKU' | 'PODGLAD' | 'ZAMIANA_W_TOKU' | 'PRZENIESIONA' | 'COFANIE_W_TOKU' | 'COFNIETA' | 'BLAD';

export interface OpisCeluCms {
  id: string;
  nazwa: string;
  opis: string;
  kiedyWarto: string[];
  coSieZmienia: string[];
}

export interface WidokCms {
  cel: 'wordpress';
  stan: StanCms;
  domena: string;
  adresPodgladu: string | null;
  adresPanelu: string | null;
  adminLogin: string | null;
  blad: string | null;
  bladEtap: string | null;
  podgladAt: string | null;
  przeniesionaAt: string | null;
  cofnietaAt: string | null;
  cofnijDo: string | null;
  kopia: string | null;
  kopiaWp: string | null;
}

export interface StanPrzejsciaCms {
  cele: OpisCeluCms[];
  dostepny: boolean;
  powod?: string;
  /** Domena, na której strona jest opublikowana (tę domenę przejmuje WordPress). */
  domena?: string;
  wordpress: WidokCms | null;
}

/** Odpowiedź instalacji podglądu – dane logowania administratora tylko raz. */
export interface WynikPodgladu extends WidokCms {
  adminHaslo: string;
  ostrzezenia: string[];
  uwaga: string;
}

export const W_TOKU: StanCms[] = ['PODGLAD_W_TOKU', 'ZAMIANA_W_TOKU', 'COFANIE_W_TOKU'];
