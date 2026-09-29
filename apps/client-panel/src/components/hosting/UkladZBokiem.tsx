import type { ReactNode } from 'react';

/**
 * Układ zakładki: główna treść po lewej, krótkie i kluczowe boxy (formularze „dodaj”, ustawienia,
 * dane połączenia) w kolumnie bocznej od xl. Na węższych ekranach kolumna boczna idzie pod treść.
 * Uwaga Dominika 29.09: długie zakładki (jak poczta przed zmianą) — jedna kolumna na cały ekran.
 */
export function UkladZBokiem({ bok, children }: { bok: ReactNode; children: ReactNode }) {
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
      <div className="min-w-0 space-y-5">{children}</div>
      <aside className="min-w-0 space-y-5">{bok}</aside>
    </div>
  );
}
