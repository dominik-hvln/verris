/**
 * Region żywy na komunikat błędu formularza (P-12, WCAG 4.1.3 — przejście VoiceOverem 12.10:
 * po złym haśle komunikat nie był odczytywany, bo pojawiał się w nowym elemencie bez roli).
 *
 * Kontener z role="alert" jest w DOM od początku (pusty), a treść wstawiana jest dopiero, gdy błąd
 * wystąpi — tylko tak czytniki (zwłaszcza VoiceOver w Safari) niezawodnie ogłaszają zmianę. Pusty
 * kontener nie zajmuje miejsca w układzie (`empty:absolute`), ale zostaje w drzewie dostępności
 * (nie `display: none`, którego czytnik nie śledzi).
 *
 * Ten sam błąd po kolejnej próbie: strona przekazuje `null` na czas wysyłki (pending), więc treść
 * znika i wraca — czytnik ogłasza ją ponownie. Pola, których błąd dotyczy, wskazują region przez
 * `aria-describedby={id}` i mają `aria-invalid`.
 */
export function RegionBledu({ id, children }: { id: string; children?: React.ReactNode }) {
  return (
    <div id={id} role="alert" aria-atomic="true" className="empty:absolute">
      {children || null}
    </div>
  );
}
