'use client';

import { useState } from 'react';
import { Loader2, HardDrive } from 'lucide-react';
import { Button } from '@verris/ui';
import { requestHostingSiteBackupAction } from '../hosting-site-backup-action';

export function BackupNowButton({ serviceId }: { serviceId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={busy}
        className="gap-2 bg-emerald-700 hover:bg-emerald-600 text-white"
        onClick={async () => {
          setMsg(null);
          setBusy(true);
          const r = await requestHostingSiteBackupAction(serviceId);
          setBusy(false);
          if ('error' in r) setMsg({ type: 'err', text: r.error });
          else
            setMsg({
              type: 'ok',
              text: 'Kopia zapasowa została zlecona. Może potrwać kilka minut — odśwież listę później.',
            });
        }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
        Utwórz kopię teraz
      </Button>
      {msg ? (
        <p className={`text-sm ${msg.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</p>
      ) : null}
    </div>
  );
}
