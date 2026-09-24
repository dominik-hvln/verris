import { ScrollText } from 'lucide-react';
import { getIamAudit } from './actions';
import { ETYKIETY_DZIENNIKA } from '@/lib/etykiety-dziennika';

export async function IamAuditSection() {
  const { entries } = await getIamAudit();
  return (
    <section className="rounded-[28px] border border-white/10 bg-[#0a0a0a]/80 p-6">
      <div className="mb-5 flex items-center gap-3">
        <ScrollText className="h-5 w-5 text-white" />
        <div>
          <h2 className="text-lg font-semibold text-white">Audyt IAM</h2>
          <p className="text-sm text-neutral-500">Ostatnie 50 zdarzeń: zmiany dostępu i działania subkont na tym koncie.</p>
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-neutral-500">Brak wpisów audytu.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"
            >
              <div>
                <span className="font-medium text-white">
                  {ETYKIETY_DZIENNIKA[entry.action] ?? entry.action}
                </span>
                {entry.actor?.name && (
                  <span className="ml-2 text-neutral-500">— {entry.actor.name}</span>
                )}
              </div>
              <time className="text-xs text-neutral-500" dateTime={entry.createdAt}>
                {new Date(entry.createdAt).toLocaleString('pl-PL')}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
