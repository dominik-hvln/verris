import Link from 'next/link';
import { acceptInviteAction } from '../dashboard/iam/actions';

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token ?? '';
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-neutral-300">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#0a0a0a] p-8">
        <h1 className="text-2xl font-bold text-white">Aktywacja subkonta</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Ustaw hasło i dane osoby, która będzie korzystać z delegowanego dostępu.
        </p>
        <form action={acceptInviteAction} className="mt-6 space-y-4">
          <input type="hidden" name="token" value={token} />
          <input name="firstName" required placeholder="Imię" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none focus:border-white/40" />
          <input name="lastName" required placeholder="Nazwisko" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none focus:border-white/40" />
          <input name="password" required minLength={8} type="password" autoComplete="new-password" placeholder="Hasło" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none focus:border-white/40" />
          <button className="w-full rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200">
            Aktywuj subkonto
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-neutral-500">
          Masz już aktywne konto? <Link href="/login" className="text-white">Przejdź do logowania</Link>
        </p>
      </div>
    </main>
  );
}
