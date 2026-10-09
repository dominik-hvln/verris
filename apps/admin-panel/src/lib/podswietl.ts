/**
 * Po wyborze w Cmd+K: czeka, aż strona docelowa wyrenderuje element z kotwicy (`#onboard-live`), przewija
 * do niego i podświetla na chwilę (atrybut `data-podswietl`, styl w globals.css). Sprawdza ścieżkę, żeby
 * nie podświetlić elementu z poprzedniej strony (np. `#dostep` innego węzła).
 */
export function podswietlKotwice(href: string, { limitMs = 4000, czasMs = 2500 } = {}): void {
  const cel = new URL(href, window.location.origin);
  const id = decodeURIComponent(cel.hash.slice(1));
  if (!id) return;
  const start = Date.now();
  const proba = () => {
    const naMiejscu = window.location.pathname === cel.pathname && window.location.search === cel.search;
    const el = naMiejscu ? document.getElementById(id) : null;
    if (el) {
      el.scrollIntoView?.({ block: "center", behavior: "smooth" });
      el.setAttribute("data-podswietl", "");
      setTimeout(() => el.removeAttribute("data-podswietl"), czasMs);
      return;
    }
    if (Date.now() - start < limitMs) setTimeout(proba, 100);
  };
  proba();
}
