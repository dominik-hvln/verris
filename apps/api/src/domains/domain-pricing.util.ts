import { Prisma } from '@verris/database';

export interface DomainPricingConfig {
  markup: number;
  usdPln: number;
  eurPln: number;
  walletCurrency: string;
  /** Stawka VAT w % (ceny rejestratora są netto — doliczamy VAT do ceny brutto). */
  vatRate: number;
}

export interface CustomerDomainPrice {
  /** Kwota brutto pobierana z portfela klienta. */
  grossAmount: string;
  netAmount: string;
  vatAmount: string;
  currency: string;
  vatRate: number;
}

function parsePositiveFloat(value: string | undefined, fallback: number): number {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function parseDomainPricingConfig(get: (key: string) => string | undefined): DomainPricingConfig {
  const vatRaw = Number.parseFloat(get('DOMAIN_VAT_RATE') ?? '');
  const vatRate = Number.isFinite(vatRaw) && vatRaw >= 0 ? vatRaw : 23;
  return {
    markup: parsePositiveFloat(get('DOMAIN_PRICE_MARKUP'), 1),
    usdPln: parsePositiveFloat(get('DOMAIN_FX_USD_PLN'), 3.65),
    eurPln: parsePositiveFloat(get('DOMAIN_FX_EUR_PLN'), 4.32),
    walletCurrency: (get('DOMAIN_WALLET_CURRENCY') ?? 'PLN').trim().toUpperCase() || 'PLN',
    vatRate,
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

/** Psychologiczne zaokrąglenie do najbliższej kwoty x,99 PLN. */
export function roundToNearest99(amount: Prisma.Decimal | string | number): Prisma.Decimal {
  const n = new Prisma.Decimal(amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (n.lte('0.99')) {
    return new Prisma.Decimal('0.99');
  }

  const integerPart = n.floor();
  const candidates = [
    integerPart.minus(1).plus('0.99'),
    integerPart.plus('0.99'),
    integerPart.plus(1).plus('0.99'),
  ].filter((c) => c.gt(0));

  let best = candidates[0]!;
  let bestDistance = n.minus(best).abs();
  for (const candidate of candidates.slice(1)) {
    const distance = n.minus(candidate).abs();
    if (distance.lt(bestDistance) || (distance.eq(bestDistance) && candidate.gt(best))) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Reseller netto → cena klienta brutto (marża na netto + VAT + zaokrąglenie do .99). */
export function toCustomerDomainPrice(
  amount: string | number,
  sourceCurrency: string,
  cfg: DomainPricingConfig,
): CustomerDomainPrice {
  const wholesale = wholesaleToWalletCurrency(amount, sourceCurrency, cfg).toDecimalPlaces(
    2,
    Prisma.Decimal.ROUND_HALF_UP,
  );
  const netWithMarkup = wholesale.mul(cfg.markup);
  const vatFactor = new Prisma.Decimal(100).plus(cfg.vatRate).div(100);
  const grossBeforeRound = netWithMarkup.mul(vatFactor);
  const grossRounded = roundToNearest99(grossBeforeRound);

  const grossFactor = new Prisma.Decimal(100).plus(cfg.vatRate);
  const netFromGross = grossRounded.mul(100).div(grossFactor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const vatFromGross = grossRounded.minus(netFromGross).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  return {
    grossAmount: grossRounded.toFixed(2),
    netAmount: netFromGross.toFixed(2),
    vatAmount: vatFromGross.toFixed(2),
    currency: cfg.walletCurrency,
    vatRate: cfg.vatRate,
  };
}
