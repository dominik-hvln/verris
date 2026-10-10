import { bramkaStrony } from "@/lib/bramka-strony";
import { redirect } from "next/navigation";

/**
 * NODE-01 — „Szybka inicjalizacja” była drugą, niepołączoną ścieżką dodania węzła (skrypt bez
 * CloudLinux/DA/LS i bez Onboard LIVE). Jedna ścieżka: kreator. Stary adres prowadzi do kreatora.
 */
export default async function InitNodePage() {
  const bramka = await bramkaStrony("/nodes/init");
  if (bramka) return bramka;
  redirect("/nodes/wizard");
}
