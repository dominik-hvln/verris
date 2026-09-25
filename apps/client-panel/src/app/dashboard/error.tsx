'use client';

import Link from 'next/link';

/**
 * Błąd strony w panelu klienta: menu zostaje, klient widzi po polsku, co się stało, może spróbować
 * ponownie albo napisać do pomocy z kodem błędu (digest łączy zgłoszenie z logiem serwera).
 */
export default function BladStrony({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-xl space-y-4 rounded-2xl border border-line bg-card p-6">
      <h1 className="text-xl font-semibold text-foreground">Nie udało się wczytać tej strony</h1>
      <p className="text-sm text-muted-foreground">
        Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę. Jeśli błąd się powtarza, napisz do nas
        {error.digest ? (
          <>
            {' '}i podaj kod <span className="font-mono text-foreground">{error.digest}</span>
          </>
        ) : null}
        .
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Spróbuj ponownie
        </button>
        <Link href="/dashboard/support/new" className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-foreground hover:bg-raised">
          Napisz do pomocy
        </Link>
      </div>
    </div>
  );
}
