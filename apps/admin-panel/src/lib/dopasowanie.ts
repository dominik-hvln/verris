/** Dopasowanie tekstu do zapytania (Cmd+K): bez polskich znaków, ranking początek > słowo > fragment. */
export const bezOgonkow = (t: string) => t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l");

/** 0 — tekst zaczyna się od słowa, 1 — któreś słowo tekstu się od niego zaczyna, 2 — fragment; null — brak. */
export function trafienie(tekst: string, w: string): number | null {
  if (tekst.startsWith(w)) return 0;
  if (tekst.split(/[^a-z0-9]+/).some((t) => t.startsWith(w))) return 1;
  return tekst.includes(w) ? 2 : null;
}

/** Ocena dopasowania (mniej = lepiej); null — któreś słowo nie pasuje. Nazwa przed sekcją i słowami kluczowymi. */
export function ocenaTrafienia(nazwa: string, dodatkowe: string, slowa: string[]): number | null {
  const n = bezOgonkow(nazwa);
  const d = bezOgonkow(dodatkowe);
  let suma = 0;
  for (const w of slowa) {
    const wNazwie = trafienie(n, w);
    if (wNazwie !== null) {
      suma += wNazwie;
      continue;
    }
    const wDodatkowych = trafienie(d, w);
    if (wDodatkowych === null) return null;
    suma += 3 + wDodatkowych;
  }
  return suma;
}

export const slowaZapytania = (q: string) => bezOgonkow(q).split(/\s+/).filter(Boolean);
