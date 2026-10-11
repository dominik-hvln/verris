import { describe, expect, it } from 'vitest';
import {
  DOMYSLNE_PROGI_SLA,
  bladProgowSla,
  odczytajProgiSla,
  terminOdpowiedzi,
  terminRozwiazania,
  terminyPoZmianiePriorytetu,
  type ProgiSla,
} from './sla-zgloszen.js';
import { godzinyDoWciazPracujemy } from './opieka-zgloszen.service.js';

const H = 3600_000;
const T0 = new Date('2026-10-11T10:00:00Z');
const progi = (o: Partial<ProgiSla['odpowiedz']> = {}, r: Partial<ProgiSla['rozwiazanie']> = {}): ProgiSla => ({
  odpowiedz: { ...DOMYSLNE_PROGI_SLA.odpowiedz, ...o },
  rozwiazanie: { ...DOMYSLNE_PROGI_SLA.rozwiazanie, ...r },
});

describe('F3.7 (OE-25) — progi SLA zgłoszeń', () => {
  it('domyślne = progi zaszyte do 11.10 (NORMAL 12 h zegarowo, decyzja 06.10)', () => {
    expect(DOMYSLNE_PROGI_SLA).toEqual({
      odpowiedz: { URGENT: 1, HIGH: 4, NORMAL: 12, LOW: 24 },
      rozwiazanie: { URGENT: 8, HIGH: 24, NORMAL: 72, LOW: 120 },
    });
    expect(terminOdpowiedzi('NORMAL', T0, DOMYSLNE_PROGI_SLA).getTime() - T0.getTime()).toBe(12 * H);
    // Priorytet spoza listy liczony jak LOW — jak dawna gałąź „else”.
    expect(terminRozwiazania('???', T0, DOMYSLNE_PROGI_SLA).getTime() - T0.getTime()).toBe(120 * H);
  });

  it('odczyt z bazy: uszkodzony zapis i złe pola → domyślne, dobre pola zostają', () => {
    expect(odczytajProgiSla('{zepsute')).toEqual(DOMYSLNE_PROGI_SLA);
    expect(odczytajProgiSla(null)).toEqual(DOMYSLNE_PROGI_SLA);
    const p = odczytajProgiSla(JSON.stringify({ odpowiedz: { NORMAL: 8, HIGH: 0, LOW: 1.5, URGENT: '1' } }));
    expect(p.odpowiedz).toEqual({ URGENT: 1, HIGH: 4, NORMAL: 8, LOW: 24 });
    expect(p.rozwiazanie).toEqual(DOMYSLNE_PROGI_SLA.rozwiazanie);
  });

  it('walidacja: pełne godziny 1–720, pilniejsze nie dłużej, odpowiedź nie później niż rozwiązanie', () => {
    expect(bladProgowSla(DOMYSLNE_PROGI_SLA)).toBeNull();
    expect(bladProgowSla(progi({ NORMAL: 0 }))).toMatch(/od 1 do 720/);
    expect(bladProgowSla(progi({ NORMAL: 2.5 }))).toMatch(/pełne godziny/);
    expect(bladProgowSla(progi({ HIGH: 30 }))).toMatch(/HIGH nie może mieć dłuższego terminu niż NORMAL/);
    expect(bladProgowSla(progi({ LOW: 200 }, { LOW: 150 }))).toMatch(/odpowiedzi \(LOW\)/);
  });

  it('zmiana priorytetu przelicza oba terminy od utworzenia zgłoszenia', () => {
    const t = { createdAt: T0, status: 'OPEN', firstResponseAt: null, slaResponseDueAt: new Date(T0.getTime() + 24 * H), slaResolveDueAt: new Date(T0.getTime() + 120 * H) };
    const teraz = new Date(T0.getTime() + 30 * 60_000);
    const w = terminyPoZmianiePriorytetu(t, 'URGENT', DOMYSLNE_PROGI_SLA, teraz);
    expect(w.slaResponseDueAt!.getTime() - T0.getTime()).toBe(1 * H);
    expect(w.slaResolveDueAt!.getTime() - T0.getTime()).toBe(8 * H);
    // Nowy termin odpowiedzi jeszcze biegnie → alert „SLA przekroczone” może przyjść ponownie.
    expect(w.slaResponseBreachAlertedAt).toBeNull();
    // Po terminie (podniesiono priorytet za późno) — bez zerowania znacznika alertu.
    expect(terminyPoZmianiePriorytetu(t, 'URGENT', DOMYSLNE_PROGI_SLA, new Date(T0.getTime() + 2 * H))).not.toHaveProperty('slaResponseBreachAlertedAt');
  });

  it('bez zmian, gdy termin już nie biegnie: była odpowiedź, zamknięte, brak terminu (założone przez obsługę)', () => {
    const baza = { createdAt: T0, status: 'OPEN', firstResponseAt: null, slaResponseDueAt: T0, slaResolveDueAt: T0 };
    expect(terminyPoZmianiePriorytetu({ ...baza, firstResponseAt: T0 }, 'HIGH', DOMYSLNE_PROGI_SLA)).not.toHaveProperty('slaResponseDueAt');
    expect(terminyPoZmianiePriorytetu({ ...baza, status: 'CLOSED' }, 'HIGH', DOMYSLNE_PROGI_SLA)).toEqual({});
    expect(terminyPoZmianiePriorytetu({ ...baza, slaResponseDueAt: null, slaResolveDueAt: null }, 'HIGH', DOMYSLNE_PROGI_SLA)).toEqual({});
  });

  it('„Wciąż nad tym pracujemy” liczy połowę skonfigurowanego czasu odpowiedzi (min. 2 h)', () => {
    expect(godzinyDoWciazPracujemy('NORMAL', progi({ NORMAL: 20, LOW: 30 }))).toBe(10);
    expect(godzinyDoWciazPracujemy('NORMAL')).toBe(6);
  });
});
