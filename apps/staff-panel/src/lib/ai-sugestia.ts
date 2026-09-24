/**
 * N-19 — sugestia AI dla zgłoszenia przychodzi jako JSON od modelu. API prosi o
 * { szkic, checklista }, ale model bywa nieposłuszny, więc bierzemy też typowe angielskie klucze
 * i pierwszy dłuższy tekst. Nic nie ginie po cichu: czego nie rozpoznamy, zostaje w `reszta`.
 */
export type SugestiaAi = { szkic: string | null; checklista: string[]; reszta: string | null };

const KLUCZE_SZKICU = ["szkic", "draft", "reply", "odpowiedz", "odpowiedź", "response", "message"];
const KLUCZE_LISTY = ["checklista", "checklist", "kroki", "steps", "weryfikacja"];

export function odczytajSugestie(raw: unknown): SugestiaAi {
  if (typeof raw === "string") return { szkic: raw.trim() || null, checklista: [], reszta: null };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { szkic: null, checklista: [], reszta: raw == null ? null : JSON.stringify(raw, null, 2) };
  }
  const obj = { ...(raw as Record<string, unknown>) };
  const wez = (klucze: string[], pasuje: (v: unknown) => boolean) => {
    const k = klucze.find((x) => x in obj && pasuje(obj[x]));
    if (!k) return undefined;
    const v = obj[k];
    delete obj[k];
    return v;
  };
  let szkic = wez(KLUCZE_SZKICU, (v) => typeof v === "string") as string | undefined;
  if (szkic === undefined) {
    const k = Object.keys(obj).find((x) => typeof obj[x] === "string" && (obj[x] as string).length > 40);
    if (k) {
      szkic = obj[k] as string;
      delete obj[k];
    }
  }
  const lista = wez(KLUCZE_LISTY, Array.isArray) as unknown[] | undefined;
  const checklista = (lista ?? [])
    .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
    .filter((x) => x.trim());
  return {
    szkic: szkic?.trim() || null,
    checklista,
    reszta: Object.keys(obj).length ? JSON.stringify(obj, null, 2) : null,
  };
}
