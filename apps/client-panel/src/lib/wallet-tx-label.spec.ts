import { walletTxDescription } from './wallet-tx-label';

describe('walletTxDescription', () => {
  it('odnowienie z nazwą planu', () => {
    expect(walletTxDescription('Auto-renewal starter (MONTH)')).toBe('Odnowienie miesięczne · Starter');
    expect(walletTxDescription('Auto-renewal poczta-standard (MONTH)')).toBe('Odnowienie miesięczne · Poczta Standard');
  });
  it('pierwsza opłata bez identyfikatora usługi', () => {
    expect(walletTxDescription('Subscription 80a46b65-96b8-438b-9ef8-ca5623393816 (initial payment)')).toBe('Pierwsza opłata za usługę');
  });
  it('zwrot za nieudane uruchomienie', () => {
    expect(walletTxDescription('Auto-refund: provisioning failed for 4e568d5e-9e50-44a6-8291-713533681aa2')).toBe(
      'Zwrot — usługi nie udało się uruchomić',
    );
  });
  it('doładowanie kartą', () => {
    expect(walletTxDescription('Doładowanie Stripe (cs_test_a1p7WljGoUGZcWJoQNXIC1JQYJa6WgsdYkbiUrUrFDw4pd1zRi7GCFCaF)')).toBe(
      'Doładowanie — Stripe',
    );
  });
  it('zwykły opis zostaje', () => {
    expect(walletTxDescription('Dodatek: Priorytetowe wsparcie (30 dni)')).toBe('Dodatek: Priorytetowe wsparcie (30 dni)');
  });
  it('brak opisu — nazwa operatora płatności albo nic', () => {
    expect(walletTxDescription(null, 'stripe')).toBe('Płatność: stripe');
    expect(walletTxDescription('')).toBeNull();
  });
});
