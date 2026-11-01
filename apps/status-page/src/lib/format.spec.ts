import { przedzial } from './format';

describe('przedzial', () => {
  it('zakłócenie w obrębie jednej minuty pokazuje jedną godzinę', () => {
    expect(przedzial('2026-10-14T09:53:10Z', '2026-10-14T09:53:50Z')).toBe('śr. 14 paź, 11:53');
  });

  it('w ciągu jednego dnia pokazuje zakres godzin', () => {
    expect(przedzial('2026-10-13T02:01:00Z', '2026-10-13T08:40:00Z')).toBe('wt. 13 paź, 04:01–10:40');
  });
});
