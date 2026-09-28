import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PLAN_PRODUKCYJNY } from '../plan-produkcyjny.js';
import { UpdatePlanDto } from './plan.dto.js';

// 28.09 — @Max(10) blokował zapis planu z ofertą CPU 12× / dysk 20× (silnik przepuszcza do 32×).
const bledy = (v: Record<string, unknown>) => validateSync(plainToInstance(UpdatePlanDto, v)).map((e) => e.property);

describe('UpdatePlanDto — krotności autoskalowania', () => {
  it('krotności z oferty przechodzą walidację', () => {
    expect(
      bledy({
        autoscalingMaxOverscaleCpu: PLAN_PRODUKCYJNY.autoscalingMaxOverscaleCpu,
        autoscalingMaxOverscaleRam: PLAN_PRODUKCYJNY.autoscalingMaxOverscaleRam,
        autoscalingMaxOverscaleDisk: PLAN_PRODUKCYJNY.autoscalingMaxOverscaleDisk,
      }),
    ).toEqual([]);
  });
  it('powyżej sufitu silnika — odrzucone', () => {
    expect(bledy({ autoscalingMaxOverscaleDisk: 33 })).toEqual(['autoscalingMaxOverscaleDisk']);
  });
});
