import { BookOpen } from 'lucide-react';
import { KbManager } from './kb-manager';
import { fetchStaffAccess } from '@/lib/staff-access';
import { brakUprawnienia } from '@/lib/akcje/wezel';

export const metadata = { title: 'Baza wiedzy (CMS) — admin Verris' };

export default async function KnowledgeBasePage() {
  // Fala 1B — odczyt bazy wiedzy ma każdy pracownik; zapis tylko z KB_MANAGE (kb.admin.controller.ts).
  const blokada = brakUprawnienia('KB_MANAGE', await fetchStaffAccess());
  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center gap-3">
        <BookOpen className="h-8 w-8 text-amber-400" />
        <div>
          <h1 className="text-[28px] lg:text-[34px]">Baza wiedzy (CMS)</h1>
          <p className="text-sm text-muted-foreground">
            Kategorie, podkategorie i artykuły (Markdown + SEO). Opublikowane trafiają na{' '}
            <a href="https://pomoc.verris.pl" target="_blank" rel="noopener" className="text-emerald-400 underline">
              pomoc.verris.pl
            </a>
            .
          </p>
        </div>
      </div>
      <KbManager blokada={blokada} />
    </div>
  );
}
