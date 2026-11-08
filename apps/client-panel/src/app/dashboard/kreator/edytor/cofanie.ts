/**
 * Lokalny stos cofania edytora (paczka 122): Ctrl/Cmd+Z i Shift+Ctrl/Cmd+Z (także z ramki podglądu – mostek
 * przekazuje skrót). Tylko w pamięci karty, niezależny od historii wersji w API. Szybkie zmiany jednego pola
 * (pisanie w formularzu) łączą się w jeden krok.
 */
export const SCALANIE_MS = 1000;
export const LIMIT_KROKOW = 100;

export class StosZmian<T> {
  private wstecz: T[] = [];
  private naprzod: T[] = [];
  private ostatniKlucz: string | null = null;
  private ostatniCzas = 0;
  private readonly zegar: () => number;

  constructor(zegar: () => number = Date.now) {
    this.zegar = zegar;
  }

  /** Stan sprzed zmiany. Ten sam `klucz` w ciągu SCALANIE_MS – bez nowego kroku (pierwszy stan zostaje). */
  zapisz(przed: T, klucz?: string): void {
    const teraz = this.zegar();
    const scal = !!klucz && klucz === this.ostatniKlucz && teraz - this.ostatniCzas < SCALANIE_MS && this.wstecz.length > 0;
    if (!scal) {
      this.wstecz.push(przed);
      if (this.wstecz.length > LIMIT_KROKOW) this.wstecz.shift();
    }
    this.naprzod = [];
    this.ostatniKlucz = klucz ?? null;
    this.ostatniCzas = teraz;
  }

  /** Poprzedni stan (bieżący trafia do ponowienia) albo null. */
  cofnij(biezacy: T): T | null {
    const s = this.wstecz.pop();
    if (s === undefined) return null;
    this.naprzod.push(biezacy);
    this.ostatniKlucz = null;
    return s;
  }

  ponow(biezacy: T): T | null {
    const s = this.naprzod.pop();
    if (s === undefined) return null;
    this.wstecz.push(biezacy);
    this.ostatniKlucz = null;
    return s;
  }

  wyczysc(): void {
    this.wstecz = [];
    this.naprzod = [];
    this.ostatniKlucz = null;
  }

  get moznaCofnac(): boolean {
    return this.wstecz.length > 0;
  }

  get moznaPonowic(): boolean {
    return this.naprzod.length > 0;
  }
}
