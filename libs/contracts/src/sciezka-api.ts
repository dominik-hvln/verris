/**
 * Ścieżka do API budowana z danych (id, nazwa domeny, plik) nie może wyjść poza zasób, który
 * wywołujący miał na myśli. `new URL()`/fetch rozwiązuje segmenty "." i ".." (także %2e), więc
 * "/domains/../admin/x" trafiłoby w inny endpoint z tym samym tokenem. Odrzucamy je w jednym
 * miejscu — w klientach API paneli — zamiast przy każdym wywołaniu.
 */
export function sprawdzSciezkeApi(path: string): string {
  // Noc 15.10 (przegląd client-apifetch-path): parser URL usuwa \t \n \r zanim rozwiąże kropki („.\t.” → „..”),
  // a „#” ucina resztę ścieżki przy tej samej metodzie. Żadna poprawna ścieżka API nie ma ani znaków sterujących,
  // ani fragmentu — wartości w query koduje URLSearchParams/encodeURIComponent.
  if (/[\x00-\x1f\x7f#]/.test(path)) throw new Error('Niedozwolona ścieżka API.');
  const sama = path.split('?', 1)[0];
  if (!sama.startsWith('/') || sama.startsWith('//') || sama.includes('\\') || /(^|\/)(\.|%2e){1,2}(\/|$)/i.test(sama)) {
    throw new Error('Niedozwolona ścieżka API.');
  }
  return path;
}
