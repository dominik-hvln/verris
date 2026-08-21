import { BookOpen } from 'lucide-react';
import { KbManager } from './kb-manager';

export const metadata = { title: 'Baza wiedzy (CMS) — admin Verris' };

export default function KnowledgeBasePage() {
  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center gap-3">
        <BookOpen className="h-8 w-8 text-amber-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Baza wiedzy (CMS)</h1>
          <p className="text-sm text-muted-foreground">
            Kategorie, podkategorie i artykuły (Markdown + SEO). Opublikowane trafiają na{' '}
            <a href="https://pomoc.verris.pl" target="_blank" rel="noopener" className="text-emerald-400 underline">
              pomoc.verris.pl
            </a>
            .
          </p>
        </div>
      </div>
      <KbManager />
    </div>
  );
}
