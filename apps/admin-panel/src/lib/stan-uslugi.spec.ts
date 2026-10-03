import { stanUslugi } from './stan-uslugi';

// Z-18 (t1 03.10): po nieudanym zakładaniu z admina usługa wisiała jako „zakładanie”.
describe('stanUslugi', () => {
  it('PROVISIONING z etapem failed to porażka, nie „trwa”', () => {
    expect(stanUslugi('PROVISIONING', 'failed')).toEqual({ t: 'zakładanie nieudane', ton: 'crit' });
  });
  it('PROVISIONING w toku zostaje „zakładanie”', () => {
    expect(stanUslugi('PROVISIONING', 'retrying').t).toBe('zakładanie');
    expect(stanUslugi('PROVISIONING', null).t).toBe('zakładanie');
  });
  it('etap failed nie zmienia innych statusów; nieznany status przechodzi wprost', () => {
    expect(stanUslugi('ACTIVE', 'failed').t).toBe('działa');
    expect(stanUslugi('COS_NOWEGO')).toEqual({ t: 'COS_NOWEGO', ton: 'muted' });
  });
});
