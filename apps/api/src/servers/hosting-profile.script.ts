import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { adresyControlPlane } from './podpis-skryptow.js';

/** Loads the canonical hosting profile bash script from the monorepo. */
export function loadHostingProfileScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-hosting-profile.sh'),
    join(process.cwd(), '../../ops/scripts/node-hosting-profile.sh'),
    join(import.meta.dirname, '../../../../../ops/scripts/node-hosting-profile.sh'),
    join(import.meta.dirname, '../../../../ops/scripts/node-hosting-profile.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, 'utf8');
    }
  }
  throw new Error('node-hosting-profile.sh not found in monorepo');
}

/**
 * Profil wydawany węzłowi (zadanie HOSTING_PROFILE): adresy z konfiguracji API wstawione w skrypt,
 * żeby węzeł nie zgadywał control-plane'u przy ograniczaniu panelu DA :2222 (decyzja 2026-09-29).
 * Pusta konfiguracja = pusty parametr = profil nie zmienia zapory. Zły adres = wyjątek (skrypt nie wyjdzie).
 */
export function hostingProfileScriptForNode(): string {
  let skrypt = loadHostingProfileScript();
  for (const zmienna of ['VERRIS_CONTROL_PLANE_IPS', 'VERRIS_DA_ADMIN_ALLOW']) {
    skrypt = skrypt.replace(new RegExp(`^${zmienna}=.*$`, 'm'), `${zmienna}="${adresyControlPlane(zmienna)}"`);
  }
  return skrypt;
}
