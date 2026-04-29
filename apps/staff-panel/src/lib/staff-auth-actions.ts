"use server";

import { redirect } from "next/navigation";
import { removeStaffAuthCookie } from "./staff-auth-cookie";

export async function staffLogout() {
  await removeStaffAuthCookie();
  redirect("/login");
}
