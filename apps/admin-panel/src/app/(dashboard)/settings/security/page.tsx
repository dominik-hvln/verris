import { redirect } from "next/navigation";

/** Stary adres (linki w e-mailach) — passkey i break-glass są teraz na „Twoje konto” (10.10). */
export default async function SecuritySettingsPage({ searchParams }: { searchParams: Promise<{ enroll?: string }> }) {
  const sp = await searchParams;
  redirect(sp?.enroll === "1" ? "/settings?enroll=1" : "/settings");
}
