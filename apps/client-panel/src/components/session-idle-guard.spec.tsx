/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SessionIdleGuard } from './session-idle-guard';

jest.mock('@/app/dashboard/actions', () => ({ logoutAction: jest.fn(async () => undefined), odswiezSesjeAction: jest.fn(async () => undefined) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * P1-11 — licznik „Do końca sesji 59:58” tykał od pierwszej sekundy i niepokoił nową testerkę.
 * Na starym kodzie licznik jest widoczny od razu po wejściu.
 */
describe('licznik sesji', () => {
  let root: Root;
  let kontener: HTMLElement;
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-03T10:00:00Z') });
    localStorage.clear();
    kontener = document.createElement('div');
    document.body.appendChild(kontener);
    root = createRoot(kontener);
  });
  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    jest.useRealTimers();
  });

  it('niewidoczny przez większość sesji, pojawia się w ostatnich 5 minutach', () => {
    act(() => root.render(<SessionIdleGuard idleMinutes={60} />));
    act(() => jest.advanceTimersByTime(2000));
    expect(kontener.querySelector('[role="timer"]')).toBeNull();
    act(() => jest.advanceTimersByTime(54 * 60_000));
    expect(kontener.querySelector('[role="timer"]')).toBeNull();
    act(() => jest.advanceTimersByTime(2 * 60_000));
    expect(kontener.querySelector('[role="timer"]')?.textContent).toMatch(/Do końca sesji: 3:5\d/);
  });
});
