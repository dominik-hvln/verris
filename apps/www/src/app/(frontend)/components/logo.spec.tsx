import { renderToStaticMarkup } from 'react-dom/server';
import { Logo } from './ui';

/** Ostatnia litera „s” dotyka prawej krawędzi viewBoxa — bez overflow="visible" przeglądarka ścina jej wygładzoną krawędź. */
it('wordmark w logo nie ucina „s” przy prawej krawędzi', () => {
  const html = renderToStaticMarkup(<Logo />);
  expect(html).toMatch(/<svg class="wm" viewBox="0 0 273\.11 80\.81" overflow="visible"/);
});
