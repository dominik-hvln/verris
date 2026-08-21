'use client';

/**
 * Wykrywa przeglądarki oparte o Apple WebKit (desktop Safari oraz WSZYSTKIE
 * przeglądarki na iOS/iPadOS — tam silnik to zawsze WebKit).
 *
 * Dlaczego to istotne dla passkey:
 * WebKit pozwala mieć tylko JEDNĄ aktywną ceremonię WebAuthn naraz. Jeśli na
 * stronie logowania działa „conditional UI" (autouzupełnianie passkey w polu
 * e-mail, mediation: 'conditional'), to wisi ona w tle jako oczekujące
 * `navigator.credentials.get()`. Gdy użytkownik kliknie przycisk „Zaloguj się
 * passkey", modalne `get()` koliduje z tą oczekującą ceremonią i Safari po
 * prostu NIE otwiera arkusza passkey.
 *
 * Chromium (Chrome/Edge) radzi sobie z taką kolizją (anuluje poprzednią
 * ceremonię), dlatego tam zostawiamy conditional UI włączone.
 */
export function isAppleWebKit(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isWebKit = /AppleWebKit/.test(ua);
  // Rodzina Chromium / Firefox / Opera (także ich warianty iOS) — NIE Safari.
  const isChromiumOrFirefox =
    /Chrome|Chromium|CriOS|Edg|EdgiOS|OPiOS|OPR|FxiOS|Brave|SamsungBrowser|Android/.test(ua);
  return isWebKit && !isChromiumOrFirefox;
}
