/**
 * Katalog rodzin sygnetów Verris (biblioteka kształtów). Kolejność = kolejność w panelu i w bloku M2 dla AI.
 * Każda rodzina: deterministyczny generator `rysuj` (te same parametry = ten sam znak), parametry całkowite
 * z zakresami; każdy zestaw w zakresie daje poprawny znak (pilnuje test siatki próbek w katalog.spec.ts).
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { kregFala } from './kreg-fala.ts';
import { kafelKrzywa } from './kafel-krzywa.ts';
import { luki } from './luki.ts';
import { siatkaKropek } from './siatka-kropek.ts';
import { pierscienie } from './pierscienie.ts';
import { promienie } from './promienie.ts';
import { gwiazda } from './gwiazda.ts';
import { krysztal } from './krysztal.ts';
import { fale } from './fale.ts';
import { gory } from './gory.ts';
import { slonceWoda } from './slonce-woda.ts';
import { liscRodzina } from './lisc.ts';
import { lukOkno } from './luk-okno.ts';
import { petla } from './petla.ts';
import { strzalka } from './strzalka.ts';
import { spirala } from './spirala.ts';
import { monogramLinia } from './monogram-linia.ts';
import { literaRama } from './litera-rama.ts';
import { literaNegatyw } from './litera-negatyw.ts';
import { kolumnaLitera } from './kolumna-litera.ts';
import { splotLiter } from './splot-liter.ts';

export const KATALOG_SYGNETOW: RodzinaSygnetu[] = [
  kregFala,
  slonceWoda,
  kafelKrzywa,
  fale,
  luki,
  promienie,
  gwiazda,
  siatkaKropek,
  pierscienie,
  petla,
  krysztal,
  gory,
  liscRodzina,
  lukOkno,
  strzalka,
  spirala,
  monogramLinia,
  literaRama,
  literaNegatyw,
  kolumnaLitera,
  splotLiter,
];

const MAPA = new Map(KATALOG_SYGNETOW.map((r) => [r.id, r]));
export function rodzinaPoId(id: string): RodzinaSygnetu | undefined {
  return MAPA.get(id);
}
