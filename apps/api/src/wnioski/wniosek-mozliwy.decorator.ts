import { SetMetadata } from '@nestjs/common';

export const WNIOSEK_MOZLIWY_KEY = 'wniosekMozliwy';

/**
 * PB-48 — operacja, o którą pracownik bez uprawnienia może złożyć wniosek (typ z rejestru-wnioskow.ts).
 * StaffPermissionsGuard przy braku uprawnienia odpowiada wtedy 403 z { code: 'WYMAGA_WNIOSKU', operacja },
 * a panel zamiast samego błędu pokazuje „Wyślij wniosek”.
 */
export const WniosekMozliwy = (typ: string) => SetMetadata(WNIOSEK_MOZLIWY_KEY, typ);
