import { newCronKey, unwrapCron, wrapCron } from './cron-output';

/** L-06 — opakowanie polecenia crona zapisem wyniku i jego odwrócenie przy edycji. */
describe('cron-output', () => {
  it('wrap/unwrap to odwrotności', () => {
    const w = wrapCron(' php $HOME/domains/a.pl/public_html/cron.php ', 'abc123def0');
    expect(w).toBe('mkdir -p $HOME/.verris-cron; ( php $HOME/domains/a.pl/public_html/cron.php ) > $HOME/.verris-cron/abc123def0.log 2>&1');
    expect(unwrapCron(w)).toEqual({ command: 'php $HOME/domains/a.pl/public_html/cron.php', key: 'abc123def0' });
    expect(unwrapCron('php x.php')).toBeNull();
  });

  it('klucz: 10 znaków a-z0-9', () => {
    expect(newCronKey()).toMatch(/^[a-z0-9]{10}$/);
  });
});
