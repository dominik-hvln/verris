import { renderToStaticMarkup } from 'react-dom/server';
import { Stepper } from './stepper';

describe('Stepper (PROD-02)', () => {
  it('oznacza aktualny krok dla czytnika ekranu i zrobione kroki', () => {
    const html = renderToStaticMarkup(<Stepper kroki={['Nazwa', 'Okres', 'Podsumowanie']} aktualny={1} />);
    const kroki = html.split('<li').slice(1);
    expect(kroki).toHaveLength(3);
    expect(kroki[1]).toContain('aria-current="step"');
    expect(kroki[0]).not.toContain('aria-current');
    expect(kroki[0]).toContain('zrobione');
    expect(kroki[2]).not.toContain('zrobione');
  });
});
