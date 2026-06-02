/**
 * Strongly typed application configuration with required values.
 *
 * Throws on startup if any required env is missing or malformed, so we never
 * accidentally run in production with hard-coded fallbacks.
 */

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;

  // CORS / panel URLs
  clientPanelUrl: string;
  staffPanelUrl: string;
  adminPanelUrl: string;

  // JWT
  jwtSecret: string;
  jwtExpiresIn: string;

  // Encryption (AES-256-GCM master key, 32 bytes hex/base64)
  appKmsKey: string;

  // Bootstrap script generation
  publicApiUrl: string;

  // Stripe (optional in dev — endpoints return 503 when missing)
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  stripeApiVersion: string;
  stripeSuccessUrl: string;
  stripeCancelUrl: string;
}

function readEnv(name: string, opts?: { default?: string; required?: boolean }): string {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  if (opts?.default !== undefined) return opts.default;
  if (opts?.required) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return '';
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got: ${raw}`);
  }
  return parsed;
}

export function loadConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV || 'development') as AppConfig['nodeEnv'];
  const isProd = nodeEnv === 'production';

  // In dev we provide stable defaults so the API runs out of the box; in prod
  // every secret must be provided explicitly.
  const jwtSecret = readEnv('JWT_SECRET', {
    required: isProd,
    default: isProd ? undefined : 'dev-jwt-secret-change-me',
  });
  const appKmsKey = readEnv('APP_KMS_KEY', {
    required: isProd,
    default: isProd ? undefined : 'dev-kms-key-change-me-32-bytes-min!!',
  });

  if (appKmsKey.length < 32) {
    throw new Error(
      'APP_KMS_KEY must be at least 32 characters long (32+ bytes of entropy).',
    );
  }

  return {
    nodeEnv,
    port: readInt('PORT', 3000),
    clientPanelUrl: readEnv('CLIENT_PANEL_URL', {
      required: isProd,
      default: isProd ? undefined : 'http://localhost:3001',
    }),
    staffPanelUrl: readEnv('STAFF_PANEL_URL', {
      required: isProd,
      default: isProd ? undefined : 'http://localhost:3002',
    }),
    adminPanelUrl: readEnv('ADMIN_PANEL_URL', {
      required: isProd,
      default: isProd ? undefined : 'http://localhost:3003',
    }),
    jwtSecret,
    jwtExpiresIn: readEnv('JWT_EXPIRES_IN', { default: '1d' }),
    appKmsKey,
    publicApiUrl: readEnv('PUBLIC_API_URL', {
      required: isProd,
      default: isProd ? undefined : 'http://localhost:3000',
    }),
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || null,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null,
    stripeApiVersion: readEnv('STRIPE_API_VERSION', { default: '2026-04-22.dahlia' }),
    stripeSuccessUrl: readEnv('STRIPE_SUCCESS_URL', {
      required: isProd,
      default: isProd ? undefined : 'http://localhost:3001/dashboard/billing?status=success',
    }),
    stripeCancelUrl: readEnv('STRIPE_CANCEL_URL', {
      required: isProd,
      default: isProd ? undefined : 'http://localhost:3001/dashboard/billing?status=cancel',
    }),
  };
}
