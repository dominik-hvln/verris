import { generateKeyPairSync } from 'crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from './configuration.js';

/**
 * 09.10 (decyzja Dominika) — API w produkcji nie startuje bez VERRIS_CONTROL_PLANE_IPS.
 * Pusta lista = strażnik SSRF (migration-net.util) nie odróżnia własnego adresu serwera
 * od hosta klienta, a połączenie na własny adres idzie lokalnie i omija zaporę.
 */
describe('loadConfig — VERRIS_CONTROL_PLANE_IPS', () => {
  const zapis = { ...process.env };
  const PROD = {
    NODE_ENV: 'production',
    JWT_SECRET: 'x'.repeat(40),
    APP_KMS_KEY: 'k'.repeat(40),
    CLIENT_PANEL_URL: 'https://panel.example.test',
    STAFF_PANEL_URL: 'https://staff.example.test',
    ADMIN_PANEL_URL: 'https://admin.example.test',
    PUBLIC_API_URL: 'https://api.example.test',
    STRIPE_SUCCESS_URL: 'https://panel.example.test/ok',
    STRIPE_CANCEL_URL: 'https://panel.example.test/anuluj',
    VERRIS_SCRIPT_SIGNING_KEY: generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
  beforeEach(() => {
    delete process.env.VERRIS_CONTROL_PLANE_IPS;
    delete process.env.VERRIS_NODE_DEPLOY_SSH_PUBKEY;
  });
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in zapis)) delete process.env[k];
    Object.assign(process.env, zapis);
  });

  it.each(['', ' , '])('produkcja z VERRIS_CONTROL_PLANE_IPS=%j — start zatrzymany czytelnym błędem', (wartosc) => {
    Object.assign(process.env, PROD, { VERRIS_CONTROL_PLANE_IPS: wartosc });
    expect(() => loadConfig()).toThrow(/Brak VERRIS_CONTROL_PLANE_IPS — w produkcji API nie wystartuje/);
  });

  it('produkcja bez zmiennej — start zatrzymany', () => {
    Object.assign(process.env, PROD);
    expect(() => loadConfig()).toThrow('VERRIS_CONTROL_PLANE_IPS');
  });

  it('produkcja z adresami control-plane — start', () => {
    Object.assign(process.env, PROD, { VERRIS_CONTROL_PLANE_IPS: '203.0.113.10,2001:db8::/64' });
    expect(loadConfig().nodeEnv).toBe('production');
  });

  it('dev/test bez zmiennej — bez zmian (start)', () => {
    process.env.NODE_ENV = 'test';
    expect(() => loadConfig()).not.toThrow();
  });
});
