import { Prisma } from '@verris/database';

export interface DomainPricingConfig {
  markup: number;
  usdPln: number;
  eurPln: number;
  walletCurrency: string;
}

function parsePositiveFloat(value: string | undefined, fallback: number): number {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function parseDomainPricingConfig(get: (key: string) => string | undefined): DomainPricingConfig {
  return {
    markup: parsePositiveFloat(get('DOMAIN_PRICE_MARKUP'), 1),
    usdPln: parsePositiveFloat(get('DOMAIN_FX_USD_PLN'), 3.65),
    eurPln: parsePositiveFloat(get('DOMAIN_FX_EUR_PLN'), 4.32),
    walletCurrency: (get('DOMAIN_WALLET_CURRENCY') ?? 'PLN').trim().toUpperCase() || 'PLN',
  };
}

/** Reseller quote → wholesale amount in wallet currency (PLN). */
export function wholesaleToWalletCurrency(
  amount: string | number,
  sourceCurrency: string,
  cfg: DomainPricingConfig,
): Prisma.Decimal {
  const code = (sourceCurrency ?? cfg.walletCurrency).trim().toUpperCase();
  const raw = new Prisma.Decimal(amount);

  if (code === cfg.walletCurrency) {
    return raw;
  }
  if (code === 'USD') {
    return raw.mul(cfg.usdPln);
  }
  if (code === 'EUR') {
    return raw.mul(cfg.eurPln);
  }
  throw new Error(`Unsupported registrar currency: ${code}`);
}

/** Reseller quote (any supported currency) → customer price in wallet currency (with markup). */
export function toCustomerDomainPrice(
  amount: string | number,
  sourceCurrency: string,
  cfg: DomainPricingConfig,
): { amount: string; currency: string } {
  const wholesale = wholesaleToWalletCurrency(amount, sourceCurrency, cfg).toDecimalPlaces(
    2,
    Prisma.Decimal.ROUND_HALF_UP,
  );
  const customer = wholesale.mul(cfg.markup).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return { amount: customer.toFixed(2), currency: cfg.walletCurrency };
}
