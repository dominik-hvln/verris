/**
 * Testy panelu w strefie UTC — tak jak render serwera Next w kontenerze. Przeglądarka klienta jest w Europe/Warsaw,
 * więc test, który w UTC widzi czas polski, pilnuje zgodności hydratacji (React #418, nocna weryfikacja 12.10).
 * Ustawione w globalSetup (proces główny, przed startem workerów) — zmiana `process.env.TZ` wewnątrz testu
 * nie działa, bo Jest daje testom kopię `process.env`.
 */
module.exports = () => {
  process.env.TZ = 'UTC';
};
