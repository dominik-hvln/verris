import { renderToStaticMarkup } from 'react-dom/server';
import { AutoscalingTimeline } from './timeline';

/** Test na żywo d3 09.10: „−−0,02 K” i surowe „block_charge 15min tx=…” pod „Zwiększono zasoby”. */
it('historia autoskalowania: jeden minus przy naliczeniu, bez zdarzeń księgowych bloku', () => {
  const html = renderToStaticMarkup(
    <AutoscalingTimeline
      events={[
        { id: 'e1', type: 'SCALE_UP', resource: null, fromValue: null, toValue: null, costAccrued: '0.02', reason: 'block_charge 15min tx=f079cc91', createdAt: '2026-10-09T11:43:00Z' },
        { id: 'e2', type: 'SCALE_UP', resource: 'CPU', fromValue: 0, toValue: 50, costAccrued: '0', reason: 'pressure', createdAt: '2026-10-09T11:43:00Z' },
      ]}
      charges={[{ id: 'c1', amount: '-0.02', description: 'Autoskalowanie — blok 15 min (cpu+50% ram+0MB disk+0MB)', createdAt: '2026-10-09T11:43:00Z' }]}
    />,
  );
  expect(html).not.toContain('block_charge');
  expect(html).not.toContain('−−');
  expect(html).toContain('−0,02');
  expect(html).toContain('+0% → +50%');
});

/** Dopłata za podbicie w trakcie bloku (09.10): zdarzenie księgowe nie wycieka, wiersz naliczenia ma opis po polsku. */
it('historia autoskalowania: dopłata w bloku bez surowego znacznika', () => {
  const html = renderToStaticMarkup(
    <AutoscalingTimeline
      events={[
        { id: 'e1', type: 'SCALE_UP', resource: null, fromValue: null, toValue: null, costAccrued: '0.50', reason: 'block_charge topup tx=ab12', createdAt: '2026-10-09T16:21:00Z' },
        { id: 'e2', type: 'SCALE_UP', resource: null, fromValue: null, toValue: null, costAccrued: '0.50', reason: 'outside_block topup 2026-10-09T16:14:00.000Z cpu+200 ram+0 disk+0', createdAt: '2026-10-09T16:21:00Z' },
      ]}
      charges={[{ id: 'c1', amount: '-0.50', description: 'Autoskalowanie — dopłata za podbicie w bloku (cpu+50%→+200%, 7,5 min)', createdAt: '2026-10-09T16:21:00Z' }]}
    />,
  );
  expect(html).not.toMatch(/topup|block_charge|outside_block|tx=/);
  expect(html).toContain('dopłata za podbicie w bloku (cpu+50%→+200%, 7,5 min)');
});
