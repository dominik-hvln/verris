import { renderToStaticMarkup } from 'react-dom/server';
import { VerrisWordmark } from './logo';

/** Ostatnia litera „s” dotyka prawej krawędzi viewBoxa — bez overflow="visible" przeglądarka ścina jej wygładzoną krawędź. */
it('wordmark nie ucina „s” przy prawej krawędzi', () => {
  expect(renderToStaticMarkup(<VerrisWordmark />)).toMatch(/<svg viewBox="0 0 273\.11 80\.81" overflow="visible"/);
});
