import { cookies } from "next/headers";

export const ADMIN_COOKIE_NAME = "admin_auth_token";

export async function setAdminAuthCookie(token: string) {
  const store = await cookies();
  store.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });
}

export async function removeAdminAuthCookie() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE_NAME);
}

export async function getAdminAuthToken() {
  const store = await cookies();
  return store.get(ADMIN_COOKIE_NAME)?.value;
}
