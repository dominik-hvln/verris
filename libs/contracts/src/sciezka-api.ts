/**
 * Ścieżka do API budowana z danych (id, nazwa domeny, plik) nie może wyjść poza zasób, który
 * wywołujący miał na myśli. `new URL()`/fetch rozwiązuje segmenty "." i ".." (także %2e), więc
 * "/domains/../admin/x" trafiłoby w inny endpoint z tym samym tokenem. Odrzucamy je w jednym
 * miejscu — w klientach API paneli — zamiast przy każdym wywołaniu.
 */
export function sprawdzSciezkeApi(path: string): string {
  const sama = path.split(/[?#]/, 1)[0];
  if (!sama.startsWith('/') || sama.startsWith('//') || sama.includes('\\') || /(^|\/)(\.|%2e){1,2}(\/|$)/i.test(sama)) {
    throw new Error('Niedozwolona ścieżka API.');
  }
  return path;
}
