import { odciskStrony, wybierzKierunki } from './kierunki.ts';
import type { FunkcjeAiKreatora } from './kontrakt.ts';
import { budujZapytanieGeneracji, budujZapytanieZmiany } from './master-prompt.ts';
import { odczytajWynikGeneracji, odczytajWynikZmiany, wiadomosciNaprawy } from './odczyt.ts';

/** Implementacja kontraktu AI kreatora – jedyny punkt, przez który API składa zapytania i czyta odpowiedzi. */
export const funkcjeAiKreatora: FunkcjeAiKreatora = {
  budujZapytanieGeneracji,
  budujZapytanieZmiany,
  wiadomosciNaprawy,
  odczytajWynikGeneracji,
  odczytajWynikZmiany,
  wybierzKierunki,
  odciskStrony,
};
