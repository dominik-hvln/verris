import Link from "next/link";
import { Mail } from "lucide-react";
import { listSystemAddresses, listTeamMailboxes } from "./actions";
import { TeamMailClient } from "./team-mail-client";

export const dynamic = "force-dynamic";

export default async function TeamMailPage() {
  let mailboxes: Awaited<ReturnType<typeof listTeamMailboxes>> = [];
  let systemAddresses: Awaited<ReturnType<typeof listSystemAddresses>> = [];
  let loadError: string | null = null;
  try {
    [mailboxes, systemAddresses] = await Promise.all([
      listTeamMailboxes(),
      listSystemAddresses(),
    ]);
  } catch {
    loadError = "Nie udało się załadować listy skrzynek. Spróbuj odświeżyć stronę.";
  }

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-center gap-3">
        <Mail className="h-8 w-8 text-sky-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Poczta zespołu</h1>
          <p className="text-sm text-muted-foreground">
            Skrzynki @verris.pl — webmail i kalendarz w{" "}
            <a href="https://mail.verris.pl/SOGo" className="text-sky-400 hover:underline" target="_blank" rel="noreferrer">
              SOGo
            </a>
            ; desktop przez IMAP. Wysyłka transakcyjna:{" "}
            <Link href="/settings/mail" className="text-emerald-400 hover:underline">
              Poczta (SMTP)
            </Link>
            .
          </p>
        </div>
      </div>
      {loadError ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {loadError}
        </p>
      ) : null}
      <TeamMailClient initial={mailboxes} systemAddresses={systemAddresses} />
      <p className="text-xs text-muted-foreground">
        Deploy infrastruktury: <code className="text-neutral-400">docs/ops/SOGO_MAIL_DEPLOY.md</code>
      </p>
    </div>
  );
}
