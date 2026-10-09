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
