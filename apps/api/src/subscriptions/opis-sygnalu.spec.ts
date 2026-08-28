import {
  BRAK_SYGNALU_MIN,
  czyWezelMilczy,
  etykietaSygnalu,
  opiszSygnal,
} from './node-capacity';

/**
 * OPS-01, druga połowa — opis sygnału życia węzła.
 *
 * Decyzja z 2026-08-28: watchdog NIE zapisuje `Server.status`. Selektor pobiera
 * węzły przez `where: { status: ACTIVE }`, więc zapis `OFFLINE` zamieniłby
 * dwuminutową przerwę w sieci w trwałe wyłączenie węzła — heartbeat by wrócił,
 * a rekord został poza zapytaniem. Zamiast zapisu: wyliczenie przy odczycie.
 */
describe('OPS-01 — opis sygnału życia', () => {
  const teraz = new Date('2026-08-28T12:00:00.000Z');
  const przed = (minut: number) => new Date(teraz.getTime() - minut * 60_000);

  describe('trzy stany, nie dwa', () => {
    it('węzeł, który nigdy się nie odezwał, ma własny stan', () => {
      const o = opiszSygnal(null, teraz);
      expect(o.stan).toBe('nigdy-nie-odpowiedzial');
      expect(o.minutBezSygnalu).toBeNull();
    });

    it('węzeł, który zamilkł, to inny stan niż ten, który nigdy nie odpowiedział', () => {
      const zamilkl = opiszSygnal(przed(30), teraz);
      const nigdy = opiszSygnal(null, teraz);
      expect(zamilkl.stan).toBe('zamilkl');
      expect(nigdy.stan).toBe('nigdy-nie-odpowiedzial');
      expect(zamilkl.stan).not.toBe(nigdy.stan);
    });

    it('węzeł odpowiadający ma stan "odpowiada"', () => {
      expect(opiszSygnal(przed(1), teraz).stan).toBe('odpowiada');
    });
  });

  describe('próg jest ten sam, co w selektorze', () => {
    it('tuż przed progiem węzeł jeszcze odpowiada', () => {
      expect(opiszSygnal(przed(BRAK_SYGNALU_MIN), teraz).stan).toBe('odpowiada');
    });

    it('tuż za progiem węzeł już zamilkł', () => {
      expect(opiszSygnal(przed(BRAK_SYGNALU_MIN + 1), teraz).stan).toBe('zamilkl');
    });

    // Gdyby opis i selektor liczyły próg osobno, panel pokazywałby „odpowiada"
    // dla węzła, który już wypadł z wyboru — albo odwrotnie. To ta sama pułapka,
    // przez którą watchdog miał własne 10 minut obok BRAK_SYGNALU_MIN.
    it('opis zgadza się z czyWezelMilczy w całym zakresie', () => {
      for (const minut of [0, 1, 5, 9, 10, 11, 15, 60, 1440]) {
        const hb = przed(minut);
        expect(opiszSygnal(hb, teraz).stan === 'zamilkl').toBe(czyWezelMilczy(hb, teraz));
      }
    });

    it('opis niesie próg, żeby panel go nie zgadywał', () => {
      expect(opiszSygnal(przed(1), teraz).progMin).toBe(BRAK_SYGNALU_MIN);
    });
  });

  describe('liczba minut', () => {
    it('liczy pełne minuty', () => {
      expect(opiszSygnal(przed(14), teraz).minutBezSygnalu).toBe(14);
    });

    it('zaokrągla w dół, nie w górę', () => {
      const hb = new Date(teraz.getTime() - (14 * 60_000 + 59_000));
      expect(opiszSygnal(hb, teraz).minutBezSygnalu).toBe(14);
    });

    // Zegar węzła może iść do przodu względem panelu. „Odezwał się za 3 minuty"
    // to nie informacja, tylko usterka pomiaru — pokazujemy 0.
    it('heartbeat z przyszłości daje 0 minut, nie liczbę ujemną', () => {
      const o = opiszSygnal(new Date(teraz.getTime() + 3 * 60_000), teraz);
      expect(o.minutBezSygnalu).toBe(0);
      expect(o.stan).toBe('odpowiada');
    });
  });

  describe('etykieta dla panelu', () => {
    it('podaje liczbę minut dla węzła, który zamilkł', () => {
      expect(etykietaSygnalu(opiszSygnal(przed(14), teraz))).toBe('nie odpowiada od 14 min');
    });

    it('rozróżnia „nigdy” od „zamilkł” również w tekście', () => {
      expect(etykietaSygnalu(opiszSygnal(null, teraz))).toBe('nigdy się nie odezwał');
    });

    it('nie krzyczy o węźle, który działa', () => {
      expect(etykietaSygnalu(opiszSygnal(przed(2), teraz))).toBe('odpowiada');
    });
  });
});
