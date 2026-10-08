"use server";

import { canAccess, fetchStaffAccess } from "@/lib/staff-access";

/**
 * PB-47 (decyzja 08.10) — czy zalogowany operator może zmienić flagę „konto wewnętrzne”
 * (ADMIN albo komplet: CUSTOMERS_MANAGE — zapis formularza operacyjnego — i CUSTOMERS_INTERNAL_FLAG; tak samo
 * jak API i wnioski). Tylko do wyglądu przełącznika; API i tak odmawia.
 */
export async function mozeOznaczacKontoWewnetrzne(): Promise<boolean> {
  const dostep = await fetchStaffAccess();
  return canAccess(dostep, "CUSTOMERS_MANAGE") && canAccess(dostep, "CUSTOMERS_INTERNAL_FLAG");
}
