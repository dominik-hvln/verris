import Link from "next/link";
import { Mail } from "lucide-react";
import { listTeamMailboxes } from "./actions";
import { TeamMailClient } from "./team-mail-client";

export const dynamic = "force-dynamic";

export default async function TeamMailPage() {
  const mailboxes = await listTeamMailboxes();

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
      <TeamMailClient initial={mailboxes} />
      <p className="text-xs text-muted-foreground">
        Deploy infrastruktury: <code className="text-neutral-400">docs/ops/SOGO_MAIL_DEPLOY.md</code>
      </p>
    </div>
  );
}
