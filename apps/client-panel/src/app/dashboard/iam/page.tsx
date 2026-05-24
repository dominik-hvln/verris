import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { FeatureNotAvailable } from '@/components/feature-not-available';
import { isClientFeatureEnabled } from '@/lib/client-features';
import { getAuthToken } from '@/lib/auth';
import { fetchSessionProfile } from '@/lib/session-profile';
import { Users, Mail, ShieldCheck, Ban } from 'lucide-react';
import {
  disableMemberAction,
  getIamOverview,
  inviteSubaccountAction,
  revokeInviteAction,
  updateMemberAction,
} from './actions';
import { IamAuditSection } from './iam-audit-section';
import { IamNoticeBanner } from './iam-notice-banner';
import { IamPermissionPicker } from './iam-permission-picker';
import { PERMISSION_LABELS } from './constants';

export default async function IamPage() {
  const token = await getAuthToken();
  const session = token ? await fetchSessionProfile(token) : null;
  if (session?.isSubaccount) {
    redirect('/dashboard');
  }

  if (!isClientFeatureEnabled('iam')) {
    return (
      <FeatureNotAvailable
        title="IAM i subkonta"
        description="Delegowanie dostępu do konta będzie dostępne po włączeniu modułu IAM w ofercie. Do tego czasu korzystaj z głównego konta właściciela."
      />
    );
  }

  const data = await getIamOverview();
  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">IAM i subkonta</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Deleguj dostęp do konta bez udostępniania hasła właściciela. Każda akcja subkonta jest limitowana uprawnieniami i widoczna w audycie.
        </p>
      </div>

      <Suspense fallback={null}>
        <IamNoticeBanner />
      </Suspense>

      <section className="rounded-[28px] border border-white/10 bg-[#0a0a0a]/80 p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <Mail className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Zaproś subkonto</h2>
            <p className="text-sm text-neutral-500">Zaproszenie jest wysyłane mailowo i wygasa po 7 dniach.</p>
          </div>
        </div>
        <form action={inviteSubaccountAction} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <input name="email" type="email" required placeholder="operator@firma.pl" className="rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none focus:border-white/40" />
            <input name="label" placeholder="np. księgowość, devops" className="rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none focus:border-white/40" />
          </div>
          <IamPermissionPicker permissions={data.permissions} />
          <button className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200">
            Wyślij zaproszenie
          </button>
        </form>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[28px] border border-white/10 bg-[#0a0a0a]/80 p-6">
          <div className="mb-5 flex items-center gap-3">
            <Users className="h-5 w-5 text-white" />
            <h2 className="text-lg font-semibold text-white">Aktywne subkonta</h2>
          </div>
          <div className="space-y-3">
            {data.members.length === 0 ? (
              <p className="text-sm text-neutral-500">Brak aktywnych subkont.</p>
            ) : data.members.map((member) => (
              <div key={member.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">{member.firstName} {member.lastName}</p>
                    <p className="text-sm text-neutral-500">{member.email}</p>
                    {member.subaccountLabel && <p className="mt-1 text-xs text-neutral-500">{member.subaccountLabel}</p>}
                  </div>
                  {member.subaccountDisabledAt ? (
                    <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs text-neutral-400">Wyłączone</span>
                  ) : (
                    <form action={disableMemberAction}>
                      <input type="hidden" name="id" value={member.id} />
                      <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/10">
                        <Ban className="mr-1 inline h-3 w-3" /> Wyłącz
                      </button>
                    </form>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {member.customerPermissions.map((p) => (
                    <span key={p} className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-neutral-400">{PERMISSION_LABELS[p] ?? p}</span>
                  ))}
                </div>
                {!member.subaccountDisabledAt && (
                  <details className="mt-4 rounded-xl border border-white/10 bg-black/40 p-4">
                    <summary className="cursor-pointer text-sm font-medium text-neutral-300">
                      Edytuj uprawnienia
                    </summary>
                    <form action={updateMemberAction} className="mt-4 space-y-4">
                      <input type="hidden" name="id" value={member.id} />
                      <input
                        name="label"
                        defaultValue={member.subaccountLabel ?? ''}
                        placeholder="Etykieta (np. devops)"
                        className="w-full rounded-xl border border-white/10 bg-black px-4 py-2.5 text-sm text-white outline-none focus:border-white/40"
                      />
                      <IamPermissionPicker
                        permissions={data.permissions}
                        defaultSelected={member.customerPermissions}
                      />
                      <button className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-neutral-200">
                        Zapisz uprawnienia
                      </button>
                    </form>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-[#0a0a0a]/80 p-6">
          <div className="mb-5 flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-white" />
            <h2 className="text-lg font-semibold text-white">Zaproszenia oczekujące</h2>
          </div>
          <div className="space-y-3">
            {data.invites.length === 0 ? (
              <p className="text-sm text-neutral-500">Brak oczekujących zaproszeń.</p>
            ) : data.invites.map((invite) => (
              <div key={invite.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">{invite.email}</p>
                    <p className="text-xs text-neutral-500">Wygasa: {new Date(invite.expiresAt).toLocaleString('pl-PL')}</p>
                  </div>
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="id" value={invite.id} />
                    <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/10">
                      Odwołaj
                    </button>
                  </form>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {invite.permissions.map((p) => (
                    <span key={p} className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-neutral-400">{PERMISSION_LABELS[p] ?? p}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <IamAuditSection />
    </div>
  );
}
