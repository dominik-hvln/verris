import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NodeTaskKind } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { HostingResourceActions, SupportActions } from '../common/audit/audit.actions.js';
import { BlokadyIpWezlaService } from '../servers/blokady-ip-wezla.admin.controller.js';
import { adresyWTekscie, kanonicznyIp, stanBlokad } from '../servers/blokady-ip.js';
import { uprawnieniaOperatora } from '../staff-roles/uprawnienia-operatora.js';
import { AkcjeKontaOperatoraService, type ZlecenieOperatora } from './akcje-konta-operatora.service.js';

/** Ile wstecz szukamy adresów klienta: logowania (LoginEvent i sesje) i zgłoszenia. */
const OKNO_MS = 90 * 24 * 60 * 60 * 1000;

export type ZrodloIp = 'logowanie' | 'zgloszenie';
export interface AdresKlienta {
  ip: string;
  zrodla: ZrodloIp[];
  ostatnio: string;
  zgloszenia: string[];
}

/**
 * F3.2 (D5) — „Zablokowało mi IP” na karcie usługi: sprawdź adres na węźle konta i odblokuj (fail2ban, zadanie IP_BLOCKS).
 *
 * Kto może co (D5):
 * - IP_UNBLOCK (L2+) — tylko adres powiązany z klientem: z historii jego logowań do panelu (90 dni) albo wpisany
 *   w zgłoszeniu; odblokowanie wymaga numeru zgłoszenia TEGO klienta i adresu z logowań albo z tego zgłoszenia;
 * - IP_BLOCKS_NODE (NOC) i ADMIN — dowolny adres, zgłoszenie opcjonalne.
 * Odblokowanie idzie przez wspólny przebieg akcji operatora (powód, dziennik OPERATOR_ACCOUNT_CHANGED, wpis klienta
 * HOSTING_IP_UNBLOCK_QUEUED — klient widzi „obsługa Verris (zgłoszenie #…)”). L2 nie widzi blokad innych adresów węzła.
 */
@Injectable()
export class BlokadyIpKontaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly akcje: AkcjeKontaOperatoraService,
    private readonly wezel: BlokadyIpWezlaService,
  ) {}

  /**
   * Usługa i jej właściciel. Przegląd F3.2: personel (STAFF) widzi i sprawdza adresy tylko na usługach klientów (USER) —
   * historia logowań administratora czy pracownika to nie „adres klienta” (ta sama reguła co karta klienta
   * w users.admin.service.ts i akcje F2.2). Usługi kont zespołu — tylko ADMIN.
   */
  private async konto(subscriptionId: string, operatorRole: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { userId: true, user: { select: { role: true } }, account: { select: { id: true, serverId: true, status: true } } },
    });
    if (!sub) throw new NotFoundException('Usługa nie istnieje.');
    if (!sub.account) throw new NotFoundException('Usługa nie ma konta hostingowego.');
    if (operatorRole !== 'ADMIN' && sub.user?.role !== 'USER') {
      throw new ForbiddenException('Personel widzi adresy IP wyłącznie na usługach klientów — usługę konta zespołu sprawdza administrator.');
    }
    return { userId: sub.userId, account: sub.account };
  }

  /** Czy operator może działać na dowolnym adresie (NOC/ADMIN), czy tylko na adresach klienta (L2). */
  private async pelnyDostep(operatorUserId: string, rola: string): Promise<boolean> {
    if (rola === 'ADMIN') return true;
    return (await uprawnieniaOperatora(this.prisma, operatorUserId)).includes('IP_BLOCKS_NODE');
  }

  /** Adresy powiązane z klientem: logowania i sesje panelu (90 dni) oraz adresy wpisane w jego zgłoszeniach. */
  async adresyKlienta(klientId: string, tylkoZgloszenie?: string | null): Promise<AdresKlienta[]> {
    const od = new Date(Date.now() - OKNO_MS);
    const mapa = new Map<string, AdresKlienta>();
    const dodaj = (surowy: string | null, zrodlo: ZrodloIp, kiedy: Date, zgloszenie?: string) => {
      const ip = kanonicznyIp((surowy ?? '').replace(/^::ffff:(?=\d+\.)/, ''));
      if (!ip) return;
      const w = mapa.get(ip) ?? { ip, zrodla: [], ostatnio: kiedy.toISOString(), zgloszenia: [] };
      if (!w.zrodla.includes(zrodlo)) w.zrodla.push(zrodlo);
      if (zgloszenie && !w.zgloszenia.includes(zgloszenie)) w.zgloszenia.push(zgloszenie);
      if (kiedy.toISOString() > w.ostatnio) w.ostatnio = kiedy.toISOString();
      mapa.set(ip, w);
    };
    if (!tylkoZgloszenie) {
      const [logowania, sesje] = await Promise.all([
        this.prisma.loginEvent.findMany({ where: { userId: klientId, createdAt: { gte: od } }, select: { ipAddress: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 200 }),
        this.prisma.userSession.findMany({ where: { userId: klientId, lastSeenAt: { gte: od } }, select: { ipAddress: true, lastSeenAt: true }, orderBy: { lastSeenAt: 'desc' }, take: 100 }),
      ]);
      for (const l of logowania) dodaj(l.ipAddress, 'logowanie', l.createdAt);
      for (const s of sesje) dodaj(s.ipAddress, 'logowanie', s.lastSeenAt);
    }
    // Zgłoszenia klienta: treść zgłoszenia i odpowiedzi klienta (nie obsługi, nie notatki wewnętrzne).
    const zgloszenia = await this.prisma.ticket.findMany({
      where: { userId: klientId, ...(tylkoZgloszenie ? { id: tylkoZgloszenie } : { updatedAt: { gte: od } }) },
      select: { id: true, message: true, createdAt: true, replies: { where: { isStaff: false, internal: false }, select: { message: true, createdAt: true }, take: 50, orderBy: { createdAt: 'desc' } } },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    });
    for (const t of zgloszenia) {
      for (const ip of adresyWTekscie(t.message)) dodaj(ip, 'zgloszenie', t.createdAt, t.id);
      for (const r of t.replies) for (const ip of adresyWTekscie(r.message)) dodaj(ip, 'zgloszenie', r.createdAt, t.id);
    }
    return [...mapa.values()].sort((a, b) => b.ostatnio.localeCompare(a.ostatnio)).slice(0, 50);
  }

  /** Stan na karcie usługi: adresy klienta i wynik ostatniego sprawdzenia / odblokowania z tej karty. */
  async stan(subscriptionId: string, operatorUserId: string, operatorRole: string) {
    const { userId, account } = await this.konto(subscriptionId, operatorRole);
    const adresy = await this.adresyKlienta(userId);
    const karta = this.stanKarty(await this.zadaniaKonta(account.id));
    // Wpis przy wydaniu adresów i wyniku — nie przy każdym odpytaniu panelu w trakcie sprawdzania (co 5 s).
    if (!karta.wToku) {
      await this.audit.record({
        action: SupportActions.OPERATOR_ACCOUNT_VIEWED,
        userId,
        actorUserId: operatorUserId,
        details: { subscriptionId, sekcja: 'blokady-ip', adresy: adresy.length },
      });
    }
    return { adresy, ...karta };
  }

  private zadaniaKonta(accountId: string) {
    return this.prisma.nodeTask.findMany({ where: { accountId, kind: NodeTaskKind.IP_BLOCKS }, orderBy: { createdAt: 'desc' }, take: 10 });
  }

  /** Z zadań tej karty: tylko sprawdzenie i operacja — pełnej listy węzła (inni klienci) karta nie pokazuje. */
  private stanKarty(zadania: Awaited<ReturnType<BlokadyIpKontaService['zadaniaKonta']>>) {
    const s = stanBlokad(zadania);
    return { wToku: s.wToku, sprawdzenie: s.sprawdzenie, operacja: s.operacja };
  }

  /** „Sprawdź IP” — czy adres jest zablokowany na węźle konta (wszystkie jaile). L2: tylko adresy klienta. */
  async sprawdz(subscriptionId: string, operatorUserId: string, operatorRole: string, ip: string) {
    const { userId, account } = await this.konto(subscriptionId, operatorRole);
    const adres = kanonicznyIp(ip);
    if (!adres) throw new BadRequestException('Podaj jeden adres IPv4 albo IPv6 (np. 203.0.113.7).');
    if (!(await this.pelnyDostep(operatorUserId, operatorRole))) {
      const znane = new Set((await this.adresyKlienta(userId)).map((a) => a.ip));
      if (!znane.has(adres)) {
        throw new ForbiddenException('Ten adres nie występuje w logowaniach ani zgłoszeniach klienta — sprawdzi go NOC.');
      }
    }
    await this.wezel.zlec(account.serverId, operatorUserId, 'list', adres, account.id);
    await this.audit.record({
      action: SupportActions.OPERATOR_ACCOUNT_VIEWED,
      userId,
      actorUserId: operatorUserId,
      details: { subscriptionId, sekcja: 'blokady-ip', ip: adres },
    });
    return { adresy: await this.adresyKlienta(userId), ...this.stanKarty(await this.zadaniaKonta(account.id)) };
  }

  /**
   * Odblokowanie (D2: odwracalne — bezpośrednio, z powodem). L2: numer zgłoszenia klienta obowiązkowy, adres z jego
   * logowań albo z tego zgłoszenia. Odmowa też trafia do dziennika zespołu (wspólny przebieg `wykonaj`).
   */
  async odblokuj(z: ZlecenieOperatora, ip: string) {
    const adres = kanonicznyIp(ip);
    if (!adres) throw new BadRequestException('Podaj jeden adres IPv4 albo IPv6 (np. 203.0.113.7).');
    const pelny = await this.pelnyDostep(z.operatorUserId, z.operatorRole);
    const wynik = await this.akcje.wykonaj(
      z,
      'odblokowanie-ip',
      { ip: adres },
      async (w) => {
        if (!pelny) {
          if (!w.zgloszenieId) throw new BadRequestException('Podaj numer zgłoszenia klienta, w którym prosi o odblokowanie.');
          const zLogowan = (await this.adresyKlienta(w.userId)).filter((a) => a.zrodla.includes('logowanie')).map((a) => a.ip);
          const zeZgloszenia = (await this.adresyKlienta(w.userId, w.zgloszenieId)).map((a) => a.ip);
          if (!zLogowan.includes(adres) && !zeZgloszenia.includes(adres)) {
            throw new ForbiddenException('Adres nie pochodzi z logowań klienta ani z tego zgłoszenia — odblokuje go NOC.');
          }
        }
        const t = await this.wezel.zlec(w.konto.serverId, z.operatorUserId, 'unban', adres, w.konto.id);
        return { ok: true as const, zadanieId: t.id };
      },
      { action: HostingResourceActions.HOSTING_IP_UNBLOCK_QUEUED, details: { target: adres } },
    );
    const { userId, account } = await this.konto(z.subscriptionId, z.operatorRole);
    return { ...wynik, adresy: await this.adresyKlienta(userId), ...this.stanKarty(await this.zadaniaKonta(account.id)) };
  }
}
