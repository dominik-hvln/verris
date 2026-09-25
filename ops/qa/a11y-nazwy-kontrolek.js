// P-12 — skan nazw dostępnych kontrolek (WCAG 1.3.1 / 4.1.2) na zalogowanym panelu, tylko odczyt (GET).
// Użycie: DevTools → Console na panelu (klient/admin/obsługa), wklej, podmień TRASY. Wynik: trasy z polami,
// przyciskami i linkami bez nazwy (etykieta, aria-label, tekst) oraz zdublowane id. Pusty obiekt = czysto.
// Ogranicznik: skanuje HTML z serwera — elementy dorysowane dopiero w przeglądarce sprawdź czytnikiem ekranu.
const TRASY = ['/'];
const wynik = {};
for (const t of TRASY) {
  const r = await fetch(t, { credentials: 'same-origin' });
  const d = new DOMParser().parseFromString(await r.text(), 'text/html');
  d.querySelectorAll('script,template').forEach((e) => e.remove());
  const nazwa = (e) => {
    const lb = e.getAttribute('aria-labelledby');
    if (lb && lb.split(/\s+/).some((i) => d.getElementById(i)?.textContent.trim())) return true;
    if (e.getAttribute('aria-label')?.trim()) return true;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName)) {
      if (e.id && d.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.textContent.trim()) return true;
      if (e.closest('label')?.textContent.trim()) return true;
      return /submit|button/.test(e.type) ? !!e.value : !!e.title;
    }
    return !!(e.textContent.trim() || e.querySelector('img[alt]')?.alt.trim() || e.title);
  };
  const bez = [];
  d.querySelectorAll('button,a[href],[role=button],[role=tab],[role=switch],[role=checkbox],[role=combobox],input:not([type=hidden]),select,textarea').forEach((e) => {
    if (!e.closest('[hidden],[aria-hidden="true"]') && !nazwa(e)) bez.push(`${e.tagName.toLowerCase()} ${e.getAttribute('placeholder') ?? ''}`.trim());
  });
  const ile = {};
  d.querySelectorAll('[id]').forEach((e) => (ile[e.id] = (ile[e.id] ?? 0) + 1));
  const dup = Object.keys(ile).filter((k) => ile[k] > 1);
  if (bez.length || dup.length || r.status !== 200) wynik[t] = { status: r.status, bez, dup };
}
console.table(wynik);
