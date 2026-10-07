import { readdirSync } from 'node:fs';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';

/**
 * Autoryzacja jest per kontroler (@UseGuards), nie globalna — kontroler albo trasa bez strażnika
 * jest PUBLICZNA. Ta lista to świadoma decyzja: nowa publiczna trasa musi tu trafić z nazwy,
 * inaczej test pada (zapomniany @UseGuards nie przejdzie po cichu).
 */
async function trasyBezStraznika(): Promise<string[]> {
  const pliki = readdirSync(new URL('../../', import.meta.url), { recursive: true, encoding: 'utf8' })
    .filter((p) => p.endsWith('.controller.ts'));
  const wynik: string[] = [];
  for (const p of pliki) {
    const mod = (await import(new URL(`../../${p}`, import.meta.url).href)) as Record<string, unknown>;
    for (const cls of Object.values(mod)) {
      if (typeof cls !== 'function') continue;
      const sciezka = Reflect.getMetadata(PATH_METADATA, cls) as string | undefined;
      if (sciezka === undefined) continue;
      if ((Reflect.getMetadata(GUARDS_METADATA, cls) as unknown[] | undefined)?.length) continue;
      const proto = (cls as { prototype: Record<string, unknown> }).prototype;
      for (const m of Object.getOwnPropertyNames(proto)) {
        const h = proto[m];
        if (m === 'constructor' || typeof h !== 'function') continue;
        if (Reflect.getMetadata(METHOD_METADATA, h) === undefined) continue;
        if ((Reflect.getMetadata(GUARDS_METADATA, h) as unknown[] | undefined)?.length) continue;
        wynik.push(`${(cls as { name: string }).name}.${m}`);
      }
    }
  }
  return wynik.sort();
}

/** Świadomie publiczne — własny mechanizm (token w adresie/nagłówku, podpis, sekret) albo treść publiczna. */
const PUBLICZNE = [
  'AbusePublicController.zglos',
  'AnalyticsPublicController.collect',
  'AnalyticsPublicController.script',
  'AuthController.authConfig',
  'AuthController.confirmEmailChange',
  'AuthController.confirmEmailVerification',
  'AuthController.confirmPasswordReset',
  'AuthController.handoff',
  'AuthController.login',
  'AuthController.loginBreakGlass',
  'AuthController.loginVerifyTwoFactor',
  'AuthController.register',
  'AuthController.requestEmailVerification',
  'AuthController.requestPasswordReset',
  'AuthController.webauthnLoginOptions',
  'AuthController.webauthnLoginVerify',
  'AuthController.webauthnStatus',
  'AutoscalingController.estimate',
  'AutoscalingController.list',
  'BrandController.ctaPattern',
  'BrandController.logo',
  'ConsentsController.unsubscribe',
  'ConsentsController.unsubscribePost',
  'ControlPlaneMailPublicController.confirmForward',
  'CustomerIamController.accept',
  'CustomerIamController.info',
  'DataExportController.download',
  'EcoPublicController.badge',
  'EcoPublicController.impressionPixel',
  'EcoPublicController.interactiveBadge',
  'EmailMarketingPublicController.confirm',
  'EmailMarketingPublicController.unsubscribeGet',
  'EmailMarketingPublicController.unsubscribePost',
  'FontsProxyController.css2',
  'FontsProxyController.file',
  'GitWebhookController.wyzwol',
  'GrafanaAuthController.sso',
  'GrafanaAuthController.ticket',
  'GrafanaAuthController.validate',
  'HealthController.liveness',
  'HealthController.readiness',
  'KbPublicController.apiArticle',
  'KbPublicController.apiTree',
  'KbPublicController.article',
  'KbPublicController.category',
  'KbPublicController.cta',
  'KbPublicController.index',
  'KbPublicController.llms',
  'KbPublicController.robots',
  'KbPublicController.sitemap',
  'LeadsPublicController.confirm',
  'LeadsPublicController.submit',
  'LegalDocumentsController.getAllCurrent',
  'LegalDocumentsController.getByVersion',
  'LegalDocumentsController.getCurrent',
  'LegalDocumentsController.listVersions',
  'MetaCapiPublicController.lead',
  'MetricsController.scrape',
  'NodeBootstrapAgentController.agentScript',
  'NodeBootstrapAgentController.report',
  'NodeBootstrapAgentController.script',
  'NodeBootstrapAgentController.secrets',
  // Webhook OpenProvidera — klucz Bearer + podpis HMAC (sprawdzWebhookOp), na Caddy tylko adresy OpenProvidera.
  'OpenproviderWebhookController.odbierz',
  'PaynowPowiadomieniaController.powiadomienie',
  'PlansController.get',
  'PlansController.list',
  'PublicBadgesController.eko',
  'PublicBadgesController.loader',
  'PublicBadgesController.referral',
  'PublicBadgesController.referralClick',
  'PublicBadgesController.seal',
  'PublicBadgesController.uptime',
  'PublicBadgesController.verify',
  'PublicStatsController.get',
  'ResellerLogoPublicController.logo',
  'StatusController.getPublic',
  'StripeWebhookController.handle',
];

describe('publiczne trasy API', () => {
  it('każda trasa bez strażnika jest na liście świadomie publicznych', async () => {
    expect(await trasyBezStraznika()).toEqual([...PUBLICZNE].sort());
  }, 60_000);
});
