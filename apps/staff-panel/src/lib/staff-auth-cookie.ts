import { cookies } from "next/headers";

/** Oddzielnie od cookie panelu admina i klienta — osobny origin (port/pod domenę). */
export const STAFF_AUTH_COOKIE = "staff_auth_token";

export async function setStaffAuthCookie(token: string) {
  const store = await cookies();
  store.set(STAFF_AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function removeStaffAuthCookie() {
  const store = await cookies();
  store.delete(STAFF_AUTH_COOKIE);
}

export async function getStaffAuthToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(STAFF_AUTH_COOKIE)?.value;
}
