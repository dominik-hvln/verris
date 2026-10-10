import { KARTA, Pigulka } from "@/components/v2";
import { ReleaseCordonButton } from "../../deliverability/release-button";
import type { CordonRow } from "../../deliverability/actions";
import type { ResellerRow } from "../../resellers/data";
import type { ReferralEnrollmentRow } from "../../referral-enrollments/data";
import { ReferralReviewActions } from "../../referral-enrollments/review-actions";
import { ResellerKlienta } from "./reseller-klienta";

/**
 * Plan E, patch 11 — operacje na kliencie, które były tylko na osobnych stronach (/deliverability,
 * /resellers, /referral-enrollments), na jego karcie. `undefined` — nie udało się odczytać (zwykle brak
 * uprawnienia); karta mówi wtedy, czego brakuje, zamiast udawać, że nic nie ma.
 */
function Sekcja({ id, tytul, children }: { id: string; tytul: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`${KARTA} flex scroll-mt-24 flex-col gap-2.5 p-[18px]`} aria-labelledby={`${id}-naglowek`}>
      <h2 id={`${id}-naglowek`} className="font-display text-[17px] font-bold">
        {tytul}
      </h2>
      {children}
    </section>
  );
}

const Brak = ({ children }: { children: React.ReactNode }) => <p className="text-[13px] text-muted-foreground">{children}</p>;

export function BlokadaPoczty({ blokada, email, isAdmin }: { blokada: CordonRow | null | undefined; email: string; isAdmin: boolean }) {
  return (
    <Sekcja id="blokada-poczty" tytul="Blokada wysyłki poczty">
      {blokada === undefined ? (
        <Brak>Nie udało się sprawdzić blokady.</Brak>
      ) : blokada === null ? (
        <Brak>Wysyłka poczty nie jest zablokowana.</Brak>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Pigulka ton="crit" className="self-start !text-xs">
              zablokowana{blokada.at ? ` od ${new Date(blokada.at).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" })}` : ""}
            </Pigulka>
            <span className="text-sm [overflow-wrap:anywhere]">{blokada.reason}</span>
            <span className="text-xs text-muted-foreground">Zdejmij dopiero po usunięciu przyczyny (hasło skrzynki, skrypt).</span>
          </div>
          {isAdmin ? (
            <ReleaseCordonButton userId={blokada.userId} label={email} />
          ) : (
            <span aria-disabled="true" title="Wymaga roli administratora" className="cursor-not-allowed text-xs text-muted-foreground opacity-60">
              Zdejmij blokadę — wymaga roli administratora
            </span>
          )}
        </div>
      )}
    </Sekcja>
  );
}

export function Reseller({ userId, reseller }: { userId: string; reseller: ResellerRow | null | undefined }) {
  return (
    <Sekcja id="reseller" tytul="Reseller">
      {reseller === undefined ? <Brak>Wymaga CUSTOMERS_MANAGE.</Brak> : <ResellerKlienta userId={userId} reseller={reseller} />}
    </Sekcja>
  );
}

const STATUS_PARTNERA: Record<string, string> = { APPROVED: "zaakceptowany", REJECTED: "odrzucony", PENDING: "czeka na decyzję" };

export function ProgramPartnerski({ zgloszenie }: { zgloszenie: ReferralEnrollmentRow | null | undefined }) {
  return (
    <Sekcja id="program-partnerski" tytul="Program partnerski">
      {zgloszenie === undefined ? (
        <Brak>Wymaga PROMO_MANAGE.</Brak>
      ) : zgloszenie === null ? (
        <Brak>Klient nie zgłosił się do programu.</Brak>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <span>
              Zgłoszenie z {new Date(zgloszenie.appliedAt).toLocaleDateString("pl-PL")} — {STATUS_PARTNERA[zgloszenie.status] ?? zgloszenie.status}
            </span>
            {zgloszenie.user.referralCode ? <span className="font-mono text-xs text-muted-foreground">kod {zgloszenie.user.referralCode}</span> : null}
            {zgloszenie.reviewNote ? <span className="text-xs text-muted-foreground">{zgloszenie.reviewNote}</span> : null}
          </div>
          {zgloszenie.status === "PENDING" ? <ReferralReviewActions userId={zgloszenie.userId} /> : null}
        </div>
      )}
    </Sekcja>
  );
}
