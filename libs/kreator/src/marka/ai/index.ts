// Kreator marki – operacje AI (master prompt M1/M2, seria, preselekcja, zamienniki, analiza logo, odświeżenie, KV,
// drobne zmiany, blokada nazw znanych marek). Jawne eksporty: `export *` w src/index.ts łączy wiele modułów.
export {
  blokiSystemuMarki,
  blokM1Marki,
  blokM2Marki,
  MAX_TOKENS_MARKI,
  opisRodzinySygnetu,
  szacujTokenyMarki,
  zbudujBlokiMarki,
} from './master-prompt-marki.ts';
export {
  koloryKierunku,
  FRAZY_ZAKAZANE_MARKI,
  naprawaMarki,
  naruszeniaTekstu,
  trescBriefuMarki,
  type WynikAiMarki,
  type ZapytanieAiMarki,
} from './wspolne-marki.ts';
export {
  MARKI_JEDNOZNACZNE,
  MARKI_WIELOZNACZNE,
  sprawdzBriefMarki,
  sprawdzNazweMarki,
  sprawdzPolecenieMarki,
  type UwagaBriefu,
  type WynikSprawdzeniaMarki,
} from './znane-marki.ts';
export {
  KONSTRUKCJE_ZNAKU,
  KONTRASTY_FORM,
  preselekcjaSerii,
  SKOJARZENIA_ZNAKU,
  type PreselekcjaMarki,
  type SlotSerii,
  type ZiarnoMarki,
  type ZnakWydany,
} from './preselekcja.ts';
export { CHARAKTER_KROJOW, krojTekstuDla } from './kroje.ts';
export { LIMITY_SYMBOLU_AI, przygotujSymbolAi } from './symbol-ai.ts';
export { kompaktujKierunek, rozwinKierunek, walidatorSymboluBiblioteki, type WalidatorSymbolu } from './kierunek-kompakt.ts';
export { budujZapytanieSerii, odczytajSerie, type WynikSerii } from './seria.ts';
export { uzupelnijSerie, zamiennikKierunku, type OcenyKierunku, type SeriaGotowa } from './zamiennik.ts';
export {
  budujZapytanieAnalizyLogo,
  KOMUNIKAT_ZNANA_MARKA,
  odczytajAnalizeLogo,
  problemyPomiarow,
  type AnalizaLogo,
  type PomiaryLogo,
} from './analiza-logo.ts';
export {
  budujZapytanieOdswiezenia,
  odczytajOdswiezenie,
  preselekcjaOdswiezenia,
  TYPY_ODSWIEZENIA,
  type KierunekOdswiezenia,
  type ObecneLogo,
  type WynikOdswiezenia,
} from './odswiezenie.ts';
export { budujZapytanieKv, koloryLogoKv, odczytajKv, type DaneLogoKv, type WynikKv } from './kv-ai.ts';
export {
  budujZapytanieDrobnejZmiany,
  odczytajDrobnaZmiane,
  RODZAJE_DROBNYCH,
  type RodzajDrobnejZmiany,
  type WynikDrobnejZmiany,
} from './drobne.ts';
export { kosztUsd, STAWKI_SONNET_55, tokenyObrazu, WYJSCIE_SZACUNEK, type StawkiModelu } from './koszt-marki.ts';
