import { AiChatService, dedupeSources } from './ai-chat.service.js';
import type { RetrievedChunk } from './knowledge-base.service.js';

/**
 * N-05 — podpowiedzi artykułów przy zakładaniu zgłoszenia.
 *
 * Panel otwiera artykuł po slugu (`/dashboard/knowledge?article=<slug>`). Wcześniej szło
 * wewnętrzne id dokumentu indeksu AI, więc kliknięta podpowiedź nie otwierała niczego.
 */
describe('N-05 – kbSuggest', () => {
  const chunk = (docId: string, title: string, sourceRef: string | null): RetrievedChunk => ({
    docId,
    title,
    content: `Treść   artykułu ${title}\n\nz odstępami`,
    score: 1,
    sourceRef,
  });

  function serwis(chunks: RetrievedChunk[]) {
    const kb = { retrieve: vi.fn(async () => chunks) };
    return new AiChatService({} as never, {} as never, kb as never, {} as never);
  }

  it('zwraca slug artykułu Bazy wiedzy, nie id dokumentu indeksu', async () => {
    const s = serwis([chunk('ckx1', 'Konfiguracja poczty', 'kb-cms:konfiguracja-poczty-imap-smtp')]);
    const r = await s.kbSuggest('poczta nie działa');
    expect(r).toEqual([
      { docId: 'konfiguracja-poczty-imap-smtp', title: 'Konfiguracja poczty', snippet: 'Treść artykułu Konfiguracja poczty z odstępami' },
    ]);
  });

  it('pomija dokumenty spoza Bazy wiedzy i duplikaty, najwyżej 3 wyniki', async () => {
    const s = serwis([
      chunk('d0', 'Notatka wewnętrzna', 'upload.pdf'),
      chunk('d1', 'A', 'kb-cms:a'),
      chunk('d1', 'A', 'kb-cms:a'),
      chunk('d2', 'B', 'kb-cms:b'),
      chunk('d3', 'C', 'kb-cms:c'),
      chunk('d4', 'D', 'kb-cms:d'),
    ]);
    const r = await s.kbSuggest('coś');
    expect(r.map((x) => x.docId)).toEqual(['a', 'b', 'c']);
  });

  it('za krótkie zapytanie → brak podpowiedzi', async () => {
    await expect(serwis([chunk('d1', 'A', 'kb-cms:a')]).kbSuggest(' ')).resolves.toEqual([]);
  });
});

/** Asystent w panelu klienta (6.11) — źródła odpowiedzi jako linki do artykułów, więc odpowiedź niesie slug. */
describe('dedupeSources – slug artykułu Bazy wiedzy', () => {
  it('artykuł Bazy wiedzy ma slug; inne źródła i puste slugi – null; duplikaty raz', () => {
    expect(
      dedupeSources([
        { docId: 'd1', title: 'Poczta', sourceRef: 'kb-cms:konfiguracja-poczty' },
        { docId: 'd1', title: 'Poczta', sourceRef: 'kb-cms:konfiguracja-poczty' },
        { docId: 'd2', title: 'Notatka', sourceRef: 'upload.pdf' },
        { docId: 'd3', title: 'Pusty', sourceRef: 'kb-cms:' },
        { docId: 'd4', title: 'Bez źródła', sourceRef: null },
      ]),
    ).toEqual([
      { docId: 'd1', title: 'Poczta', slug: 'konfiguracja-poczty' },
      { docId: 'd2', title: 'Notatka', slug: null },
      { docId: 'd3', title: 'Pusty', slug: null },
      { docId: 'd4', title: 'Bez źródła', slug: null },
    ]);
  });
});
