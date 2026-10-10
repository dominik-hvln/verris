import { DzialaniaKarty } from "@/components/dzialania-karty";
import { akcjeWezla, type DostepDoAkcji, type WezelDlaAkcji } from "@/lib/akcje/wezel";

/**
 * 10.10 (Dominik nie mógł znaleźć ponownego Onboard LIVE — był tylko w kreatorze) — wszystkie działania
 * na węźle w jednym miejscu, na Przeglądzie karty. Lista pochodzi z rejestru lib/akcje/wezel.ts; pozycja
 * prowadzi do miejsca, gdzie działanie się uruchamia. Bez uprawnień — wyszarzona z dymkiem.
 */
export function DzialaniaWezla({ wezel, dostep }: { wezel: WezelDlaAkcji; dostep: DostepDoAkcji }) {
  return <DzialaniaKarty id="dzialania-wezla" dzialania={akcjeWezla(wezel, dostep)} />;
}
