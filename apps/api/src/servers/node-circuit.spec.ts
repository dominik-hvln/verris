import { NODE_DOWN_MS, TIMEOUT_WINDOW_MS, nodeDownFor, nodeErrorKind, recordNodeFailure, recordNodeSuccess, resetNodeCircuits } from '@verris/directadmin-sdk';

describe('bezpiecznik węzła DirectAdmin', () => {
  const key = 'https://node-test:2222';
  beforeEach(() => resetNodeCircuits());

  it('odpowiedź HTTP (np. 500) nie jest awarią węzła', () => {
    expect(nodeErrorKind({ code: 'ERR_BAD_RESPONSE', response: { status: 500 } })).toBeNull();
    expect(recordNodeFailure(key, { code: 'ECONNREFUSED', response: { status: 502 } })).toBe(false);
  });

  it('odmowa połączenia / brak DNS otwiera bezpiecznik od razu', () => {
    expect(recordNodeFailure(key, { code: 'ENOTFOUND' }, 1_000)).toBe(true);
    expect(nodeDownFor(key, 1_000)).toBe(NODE_DOWN_MS);
    expect(nodeDownFor(key, 1_000 + NODE_DOWN_MS)).toBe(0);
  });

  it('pojedynczy timeout nie odcina węzła, drugi w oknie — tak', () => {
    expect(recordNodeFailure(key, { code: 'ECONNABORTED' }, 0)).toBe(false);
    expect(nodeDownFor(key, 0)).toBe(0);
    expect(recordNodeFailure(key, { code: 'ECONNABORTED' }, 5_000)).toBe(true);
    expect(nodeDownFor(key, 5_000)).toBeGreaterThan(0);
  });

  it('timeouty daleko od siebie nie sumują się', () => {
    recordNodeFailure(key, { code: 'ETIMEDOUT' }, 0);
    expect(recordNodeFailure(key, { code: 'ETIMEDOUT' }, TIMEOUT_WINDOW_MS + 1)).toBe(false);
  });

  it('drugi timeout minutę później (zapytania panelu idą po kolei) też otwiera', () => {
    recordNodeFailure(key, { code: 'ETIMEDOUT' }, 0);
    expect(recordNodeFailure(key, { code: 'ETIMEDOUT' }, 60_000)).toBe(true);
    expect(nodeDownFor(key, 60_000 + 90_000)).toBeGreaterThan(0);
  });

  it('udane zapytanie zamyka bezpiecznik', () => {
    recordNodeFailure(key, { code: 'ECONNREFUSED' }, Date.now());
    recordNodeSuccess(key);
    expect(nodeDownFor(key)).toBe(0);
  });
});
