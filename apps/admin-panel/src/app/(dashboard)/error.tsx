"use client";

/**
 * Błąd strony w obrębie panelu: menu zostaje, a zamiast pustego „This page couldn’t load”
 * operator widzi, co się stało, i może spróbować ponownie. Kod (digest) łączy zgłoszenie z logiem serwera.
 */
export default function BladStrony({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-xl space-y-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6">
      <h1 className="text-xl font-semibold text-white">Nie udało się wczytać tej strony</h1>
      <p className="text-sm text-rose-100">
        Serwer zwrócił błąd. Spróbuj ponownie; jeśli się powtarza, sprawdź uprawnienia roli albo logi API.
        {error.digest ? <> Kod błędu: <span className="font-mono">{error.digest}</span>.</> : null}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
      >
        Spróbuj ponownie
      </button>
    </div>
  );
}
