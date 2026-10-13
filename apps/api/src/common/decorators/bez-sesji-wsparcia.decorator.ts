import { SetMetadata } from '@nestjs/common';

export const BEZ_SESJI_WSPARCIA_KEY = 'verris:bez-sesji-wsparcia';

/**
 * Audyt 13.10 (impersonation-mints-persistent-node-credentials, iam-invite-persistent-access) — trasy, które
 * tworzą albo zmieniają TRWAŁE poświadczenia i kanały dostępu do konta klienta (FTP, skrzynki, użytkownicy baz,
 * klucze SSH, webhooki, zaproszenia IAM). W sesji „Zaloguj jako klient” (impersonatedBy) operator ustaliłby dane
 * logowania, które zna i które przetrwają koniec sesji — odmowa w CustomerPermissionsGuard, centralnie.
 * Operator robi te rzeczy paskiem akcji operatora (losowe hasło, dziennik).
 */
export const BezSesjiWsparcia = () => SetMetadata(BEZ_SESJI_WSPARCIA_KEY, true);
