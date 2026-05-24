import { Mail, ExternalLink } from "lucide-react";
import Link from "next/link";
import { staffApi } from "@/lib/staff-api";

export const dynamic = "force-dynamic";

type ConnectionInfo =
  | {
      hasMailbox: false;
      mailHost: string;
      sogoUrl: string;
      hint: string;
    }
  | {
      hasMailbox: true;
      email: string;
      displayName: string | null;
      quotaMb: number;
      mailHost: string;
      sogoUrl: string;
      imap: { host: string; port: number; security: string; username: string };
      smtp: { host: string; port: number; security: string; username: string };
      caldavUrl: string;
      documentation: string;
    };

export default async function StaffMailSettingsPage() {
  const info = await staffApi<ConnectionInfo>("/staff/mail/connection-info");

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8">
      <div className="flex items-center gap-3">
        <Mail className="h-8 w-8 text-cyan-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Poczta @verris.pl</h1>
          <p className="text-sm text-muted-foreground">
            Webmail i kalendarz w SOGo; na komputerze — Outlook, Thunderbird lub Apple Mail.
          </p>
        </div>
      </div>

      {!info.hasMailbox ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-sm text-amber-100">
          {info.hint}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-black/40 p-6 space-y-3">
            <p className="text-lg font-semibold text-white">{info.email}</p>
            {info.displayName ? (
              <p className="text-sm text-muted-foreground">{info.displayName}</p>
            ) : null}
            <a
              href={info.sogoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-500/20 border border-cyan-500/40 px-4 py-2 text-sm font-semibold text-cyan-100"
            >
              Otwórz SOGo (webmail + kalendarz)
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          <dl className="rounded-2xl border border-white/10 divide-y divide-white/5 text-sm">
            <div className="grid grid-cols-3 gap-2 px-4 py-3">
              <dt className="text-neutral-500">IMAP</dt>
              <dd className="col-span-2 font-mono text-white">
                {info.imap.host}:{info.imap.port} ({info.imap.security}) — login: {info.imap.username}
              </dd>
            </div>
            <div className="grid grid-cols-3 gap-2 px-4 py-3">
              <dt className="text-neutral-500">SMTP</dt>
              <dd className="col-span-2 font-mono text-white">
                {info.smtp.host}:{info.smtp.port} ({info.smtp.security}) — login: {info.smtp.username}
              </dd>
            </div>
            <div className="grid grid-cols-3 gap-2 px-4 py-3">
              <dt className="text-neutral-500">CalDAV</dt>
              <dd className="col-span-2 font-mono text-xs text-cyan-300/90 break-all">{info.caldavUrl}</dd>
            </div>
          </dl>

          <p className="text-xs text-muted-foreground">{info.documentation}</p>
        </div>
      )}

      <Link href="/settings" className="text-sm text-cyan-400 hover:underline">
        ← Ustawienia
      </Link>
    </div>
  );
}
