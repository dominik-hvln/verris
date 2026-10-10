/**
 * B1 — z formularza edycji kodu buduje ciało PATCH tylko z pól, które operator zmienił,
 * żeby wpis w dzienniku pokazywał rzeczywistą zmianę. Puste pole = zdjęcie terminu/limitu/opisu (`null`).
 */
export interface StanKodu {
  validTo: string | null;
  maxRedemptions: number | null;
  description: string | null;
}

export interface PoleFormularza {
  /** Wartość pola daty w formacie `RRRR-MM-DDTHH:mm` (czas lokalny) albo pusta. */
  validTo: string;
  maxRedemptions: string;
  description: string;
}

export type ZmianaKodu = Partial<StanKodu>;

const dwa = (n: number) => String(n).padStart(2, "0");

/** ISO z API → wartość pola daty (czas lokalny przeglądarki). */
export function doPolaDaty(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${dwa(d.getMonth() + 1)}-${dwa(d.getDate())}T${dwa(d.getHours())}:${dwa(d.getMinutes())}`;
}

export function zbudujZmiane(przed: StanKodu, pole: PoleFormularza): { ok: true; zmiana: ZmianaKodu } | { ok: false; blad: string } {
  const zmiana: ZmianaKodu = {};

  if (pole.validTo.trim() !== doPolaDaty(przed.validTo)) {
    if (!pole.validTo.trim()) zmiana.validTo = null;
    else {
      const d = new Date(pole.validTo);
      if (Number.isNaN(d.getTime())) return { ok: false, blad: "Niepoprawna data." };
      zmiana.validTo = d.toISOString();
    }
  }

  const limit = pole.maxRedemptions.trim();
  const limitPo = limit === "" ? null : Number(limit);
  if (limitPo !== null && (!Number.isInteger(limitPo) || limitPo < 0)) {
    return { ok: false, blad: "Limit użyć: liczba całkowita ≥ 0 albo puste (bez limitu)." };
  }
  if (limitPo !== przed.maxRedemptions) zmiana.maxRedemptions = limitPo;

  const opis = pole.description.trim() || null;
  if (opis !== (przed.description ?? null)) zmiana.description = opis;

  if (Object.keys(zmiana).length === 0) return { ok: false, blad: "Nic się nie zmieniło." };
  return { ok: true, zmiana };
}
