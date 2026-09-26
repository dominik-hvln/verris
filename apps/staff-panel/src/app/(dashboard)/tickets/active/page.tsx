import { redirect } from "next/navigation";

/** PB-34 — „Aktywne” zastąpiła pozycja menu „Moje” (skrzynka z filtrem); stare linki dalej działają. */
export default function ActiveTicketsPage() {
  redirect("/?widok=moje");
}
