/**
 * Upoważnienie RODO/DPA do migracji — jeden tekst dla kreatora klienta (krok „Start”) i dla zgody na migrację
 * przygotowaną przez obsługę (PB-45, decyzja 08.10: „ten sam tekst co w kreatorze”).
 */
export function TrescUpowaznienia() {
  return (
    <span>
      Oświadczam, że mam prawo przenieść wskazane dane i <strong>upoważniam Verris</strong> do
      jednorazowego dostępu do wskazanego hostingu źródłowego w celu wykonania migracji. Rozumiem,
      że dane dostępowe są szyfrowane i usuwane po zakończeniu. Akceptuję{' '}
      <a href="/legal/dpa" target="_blank" className="text-cyan-300 underline">Umowę powierzenia (DPA)</a>,{' '}
      <a href="/legal/privacy" target="_blank" className="text-cyan-300 underline">Politykę prywatności</a>{' '}
      i <a href="/legal/terms" target="_blank" className="text-cyan-300 underline">Regulamin</a>.
    </span>
  );
}
