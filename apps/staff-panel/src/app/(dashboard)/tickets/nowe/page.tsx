import Link from "next/link";
import { requireStaffSession } from "@/lib/staff-session";
import { maUprawnienie, pobierzDostepOperatora } from "@/lib/staff-access";
import { NoweZgloszenieForm } from "./nowe-zgloszenie-form";

export const dynamic = "force-dynamic";

/**
 * F2.5 — zgłoszenie założone przez obsługę w imieniu klienta (sprawa z telefonu, awaria, nadużycie). Klient dostaje
 * mail „Obsługa Verris napisała do Ciebie” i odpowiada w panelu; zgłoszenie od razu czeka na jego odpowiedź.
 */
export default async function NoweZgloszeniePage({ searchParams }: { searchParams: Promise<{ userId?: string; email?: string }> }) {
  await requireStaffSession();
  const { userId, email } = await searchParams;
  const dostep = await pobierzDostepOperatora();
  const moze = maUprawnienie(dostep, "TICKETS_MANAGE");
  return (
    <div className="flex max-w-[760px] flex-col gap-4">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Obsługa · zgłoszenia</span>
        <h1 className="font-display text-[30px] font-extrabold tracking-[-0.02em]">Nowe zgłoszenie w imieniu klienta</h1>
        <p className="text-sm text-muted-foreground">
          Klient dostanie e-mail od „Obsługa Verris” (bez Twojego nazwiska) i odpowie w panelu. Zgłoszenie od razu czeka na jego odpowiedź.
        </p>
      </header>
      {moze ? (
        <NoweZgloszenieForm userId={userId ?? null} email={email ?? ""} />
      ) : (
        <p role="alert" className="rounded-[10px] border border-line bg-card px-4 py-3 text-sm text-muted-foreground">
          Twoja rola nie zakłada zgłoszeń (potrzebne uprawnienie: obsługa zgłoszeń). <Link href="/">Wróć do skrzynki</Link>
        </p>
      )}
    </div>
  );
}
