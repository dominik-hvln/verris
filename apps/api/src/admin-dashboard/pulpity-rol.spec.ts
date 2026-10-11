import { SLA_ZAGROZONE_MIN, terminZgloszenia } from './pulpity-rol.service.js';

/** F3.9 — termin zgłoszenia na pulpicie obsługi: najpierw pierwsza odpowiedź, potem rozwiązanie; czekające na klienta — bez zegara. */
const teraz = Date.parse('2026-10-11T10:00:00Z');
const za = (min: number) => new Date(teraz + min * 60_000);

describe('F3.9 — terminZgloszenia', () => {
  it('bez pierwszej odpowiedzi liczy się termin odpowiedzi (po terminie / zagrożone / w terminie)', () => {
    expect(terminZgloszenia({ status: 'OPEN', firstResponseAt: null, slaResponseDueAt: za(-5), slaResolveDueAt: za(600) }, teraz)).toEqual({ termin: za(-5).toISOString(), rodzaj: 'odpowiedz', stan: 'po-terminie' });
    expect(terminZgloszenia({ status: 'OPEN', firstResponseAt: null, slaResponseDueAt: za(SLA_ZAGROZONE_MIN), slaResolveDueAt: null }, teraz).stan).toBe('zagrozone');
    expect(terminZgloszenia({ status: 'OPEN', firstResponseAt: null, slaResponseDueAt: za(SLA_ZAGROZONE_MIN + 1), slaResolveDueAt: null }, teraz).stan).toBe('w-terminie');
  });

  it('po pierwszej odpowiedzi — termin rozwiązania; czekające na klienta — brak terminu', () => {
    expect(terminZgloszenia({ status: 'IN_PROGRESS', firstResponseAt: za(-60), slaResponseDueAt: za(-100), slaResolveDueAt: za(-1) }, teraz)).toMatchObject({ rodzaj: 'rozwiazanie', stan: 'po-terminie' });
    expect(terminZgloszenia({ status: 'WAITING_CUSTOMER', firstResponseAt: za(-60), slaResponseDueAt: za(-100), slaResolveDueAt: za(-1) }, teraz)).toEqual({ termin: null, rodzaj: null, stan: 'brak' });
  });
});
