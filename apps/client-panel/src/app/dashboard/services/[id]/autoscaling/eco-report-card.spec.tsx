import { renderToStaticMarkup } from 'react-dom/server';
import { EcoReportCard } from './eco-report-card';

/** t1 05.10 — karta w wąskiej kolumnie: 4 kolumny łamały „0,01 kWh” i „−100%”. Zawsze 2 kolumny, wartość w jednej linii. */
it('raport energetyczny: siatka 2 kolumny bez wariantu 4-kolumnowego, wartości bez łamania', () => {
  const html = renderToStaticMarkup(
    <EcoReportCard
      report={{
        samples: 9868, energyKwh: 0.01, co2Kg: 0.01, savedEnergyKwh: 21.33, baselineEnergyKwh: 21.34,
        treeMonthsEquivalent: 7.3, cpuCoreHours: 0.7, avgRamGb: 0.01, ecoModeEnabled: false, methodology: 'Szacunek.',
      } as never}
    />,
  );
  expect(html).not.toContain('md:grid-cols-4');
  expect(html).toContain('grid grid-cols-2');
  expect((html.match(/whitespace-nowrap text-lg/g) ?? []).length).toBe(4);
});
