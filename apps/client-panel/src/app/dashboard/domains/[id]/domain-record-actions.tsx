'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@verris/ui';
import type { DomainDto } from '@verris/contracts';
import { verifyDomainAction, deleteDomain, runDomainChecklistAction } from '../actions';
import { RefreshCw, Trash2 } from 'lucide-react';

export function DomainRecordActions({ domain }: { domain: DomainDto }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'verify' | 'checklist' | 'delete' | null>(null);

  async function onVerify() {
    setBusy('verify');
    try {
      await verifyDomainAction(domain.id);
      toast.success('Zweryfikowano domenę (rekordy DNS).');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Weryfikacja nie powiodła się');
    } finally {
      setBusy(null);
    }
  }

  async function onChecklist() {
    setBusy('checklist');
    try {
      await runDomainChecklistAction(domain.id);
      toast.success('Asystent domeny zapisał nowy wynik DNS/SSL.');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Checklist DNS/SSL nie powiódł się');
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!confirm(`Usunąć domenę ${domain.name} z portfolia?`)) return;
    setBusy('delete');
    try {
      await deleteDomain(domain.id);
      toast.success('Domena usunięta');
      router.push('/dashboard/domains');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Błąd usuwania');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ml-auto flex flex-wrap items-center gap-2">
      {domain.status !== 'ACTIVE' ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-white/15 text-white"
          disabled={busy !== null}
          onClick={() => void onVerify()}
        >
          <RefreshCw className={`mr-1.5 h-4 w-4 ${busy === 'verify' ? 'animate-spin' : ''}`} />
          Sprawdź DNS
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-cyan-500/30 text-cyan-100"
        disabled={busy !== null}
        onClick={() => void onChecklist()}
      >
        <RefreshCw className={`mr-1.5 h-4 w-4 ${busy === 'checklist' ? 'animate-spin' : ''}`} />
        Asystent DNS/SSL
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-rose-500/40 text-rose-200 hover:bg-rose-500/10"
        disabled={busy !== null}
        onClick={() => void onDelete()}
      >
        <Trash2 className="mr-1.5 h-4 w-4" />
        Usuń z portfolia
      </Button>
    </div>
  );
}
