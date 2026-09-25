import { redirect } from "next/navigation";

/**
 * NODE-01 — „Szybka inicjalizacja” była drugą, niepołączoną ścieżką dodania węzła (skrypt bez
 * CloudLinux/DA/LS i bez Onboard LIVE). Jedna ścieżka: kreator. Stary adres prowadzi do kreatora.
 */
export default function InitNodePage() {
  redirect("/nodes/wizard");
}
