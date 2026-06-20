import { BookOpen } from 'lucide-react';
import { PanelCard, PanelPageHeader } from '@/components/panel';
import { fetchKbArticles } from './knowledge-actions';
import { KnowledgeClient } from './knowledge-client';

export const dynamic = 'force-dynamic';

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ article?: string }>;
}) {
  const { article } = await searchParams;
  const articles = await fetchKbArticles();

  return (
    <div className="space-y-4">
      <PanelPageHeader
        icon={<BookOpen className="h-6 w-6 text-violet-300" />}
        title="Baza wiedzy"
        description="Poradniki i odpowiedzi na najczęstsze pytania o hosting, domeny i pocztę."
      />
      <PanelCard>
        <KnowledgeClient articles={articles} initialArticleId={article ?? null} />
      </PanelCard>
    </div>
  );
}
