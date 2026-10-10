/**
 * D1 (10.10) — karta w panelu obsługi jest przestarzała: pełna karta (wszystkie działania wg uprawnień, wnioski)
 * jest w panelu operatora. Kod karty zostaje do czasu przeniesienia skrzynki; nowe funkcje trafiają tylko tam.
 */
export function KartaWPaneluOperatora({ href, co }: { href: string; co: "klienta" | "usługi" }) {
  return (
    <div
      role="note"
      data-karta-przestarzala=""
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-50"
    >
      <p>
        <strong>Ta karta jest przestarzała.</strong> Pełna karta {co} jest w panelu operatora.
      </p>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-400/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-400/25"
      >
        Otwórz w panelu operatora
        <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
}
