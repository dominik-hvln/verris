// P5-01 — wersja dla przeglądarki (libs/contracts/src/bledy-klienta.ts): te same reguły co na serwerze, bez wzorca
// white label. Nazwy oprogramowania serwera wycina wcześniej API (filtr wyjątków) i `apiFetch` (lib/api.ts).
export { HOSTING_FETCH_UNAVAILABLE, daErrorMessage, hostingFetchErrorMessage } from '@verris/contracts/klient';
