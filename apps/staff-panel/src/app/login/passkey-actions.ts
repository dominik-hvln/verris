"use server";

import { setStaffAuthCookie } from "@/lib/staff-auth-cookie";

/** Passkey (WebAuthn) dla panelu staff — rola STAFF/ADMIN weryfikowana przed cookie. */
export async function setStaffPasskeyAuthCookie(accessToken: string): Promise<void> {
  await setStaffAuthCookie(accessToken);
}
