import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { AccountStatus, KreatorCmsStan, KreatorStatus, NodeTaskKind, NodeTaskStatus, type KreatorCms, type KreatorStrona } from '@verris/database';
import { PLANY_KREATORA, celeCms, eksportujDoCms, fontyEksportu, migrujModel, walidujStrone, type Strona, type WersjaKreatora } from '@verris/kreator';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { HostingResourceActions } from '../../common/audit/audit.actions.js';
import { DirectAdminService } from '../../servers/directadmin.service.js';
import { FontsProxyService } from '../../fonts-proxy/fonts-proxy.service.js';
import { bladZadaniaDlaKlienta } from '../../subscriptions/blad-zadania.js';
import { KreatorService } from '../kreator.service.js';
import { KreatorZasobyService } from '../zasoby.service.js';
import { adresFormularza } from '../formularz-token.js';
import { PLIK_ZNACZNIKA, PREFIKS_KOPII, nazwaKopii, odczytajZnacznik, polacz } from '../publikacja.js';
import { PLIKI_HOSTINGU_KREATORA, type PlikiHostingu } from '../pliki-hostingu.js';
import { MAKS_PACZKI, zbudujPaczke } from './paczka.js';

export { POWOD_PRZENIESIONA, STANY_BLOKUJACE_PUBLIKACJE } from './stan-cms.js';

/** Ile dni po zamianie można wrócić do strony z kreatora (kopia w katalogu domeny). */
export const OKRES_COFNIECIA_DNI = 30;
/** Katalog paczek importu w katalogu domeny (poza public_html). */
export const KATALOG_PACZEK = '.verris-kreator-wp';
export const KATALOG_PODGLADU = '.verris-wp-podglad';
const DZIEN = 24 * 60 * 60 * 1000;
const DOMENA_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;
const NAZWA_WPISU = /^[A-Za-z0-9._-]{1,128}$/;

/** WordPress w katalogu podglądu / już w katalogu strony – adres pokazywany klientowi. */
const STANY_PODGLADU: KreatorCmsStan[] = [KreatorCmsStan.PODGLAD, KreatorCmsStan.ZAMIANA_W_TOKU];
const STANY_NA_DOMENIE: KreatorCmsStan[] = [KreatorCmsStan.PRZENIESIONA, KreatorCmsStan.COFANIE_W_TOKU];
const W_TOKU: KreatorCmsStan[] = [KreatorCmsStan.PODGLAD_W_TOKU, KreatorCmsStan.ZAMIANA_W_TOKU, KreatorCmsStan.COFANIE_W_TOKU];

const BLEDY: Record<string, string> = {
  podglad: 'Instalacja podglądu WordPressa nie powiodła się.',
  zamiana: 'Zamiana strony na WordPressa nie powiodła się – strona z kreatora została na domenie.',
  cofniecie: 'Cofnięcie nie powiodło się – na domenie działa dalej WordPress.',
};

export interface WidokCms {
  cel: 'wordpress';
  stan: KreatorCmsStan;
  domena: string;
  adresPodgladu: string | null;
  adresPanelu: string | null;
  adminLogin: string | null;
  blad: string | null;
  bladEtap: string | null;
  podgladAt: Date | null;
  przeniesionaAt: Date | null;
  cofnietaAt: Date | null;
  /** Do kiedy można cofnąć przejście (kopia strony z kreatora); null = nie dotyczy albo minęło. */
  cofnijDo: Date | null;
  kopia: string | null;
  kopiaWp: string | null;
}

type Rekord = KreatorStrona;

/**
 * Verris Kreator – przejście strony na WordPressa na hostingu klienta (paczka 124, etap 3 koncepcji).
 *
 * 1. Podgląd („instalacja obok”): eksport strony (libs/kreator/src/eksport – motyw blokowy, strony w blokach, menu,
 *    media) jako ZIP wgrany menedżerem plików do <katalog domeny>/.verris-kreator-wp, baza przez panel serwera (jak
 *    instalator WordPressa), zadanie węzła KREATOR_WP: WordPress w <katalog strony>/.verris-wp-podglad/<klucz>
 *    (klucz = hasło w linku, bez indeksowania), import paczki wp-cli jako użytkownik konta.
 * 2. Zamiana: strona z kreatora do kopii w katalogu domeny (jak kopia przy publikacji), WordPress do katalogu strony,
 *    adres domeny zamiast adresu podglądu. Kreator przestaje publikować na tę domenę.
 * 3. Cofnięcie (do OKRES_COFNIECIA_DNI dni): WordPress do kopii, strona z kreatora wraca.
 * Stan zadania odczytywany przy odpytywaniu (GET) – bez osobnego nasłuchu zakończeń zadań węzła.
 */
@Injectable()
export class KreatorWordpressService {
  private readonly logger = new Logger(KreatorWordpressService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly kreator: KreatorService,
    private readonly audit: AuditService,
    private readonly da: DirectAdminService,
    private readonly fonty: FontsProxyService,
    @Inject(PLIKI_HOSTINGU_KREATORA) private readonly hosting: PlikiHostingu,
    @Optional() private readonly zasoby?: KreatorZasobyService,
  ) {}

  // ---------------------------------------------------------------------------
  // GET /kreator/strony/:id/cms
  // ---------------------------------------------------------------------------

  async stan(userId: string, id: string) {
    const d = await this.kreator.dostep(userId);
    const s = await this.wlasna(userId, id);
    const cms = await this.odswiez(await this.prisma.kreatorCms.findUnique({ where: { stronaId: id } }));
    const powod = !d.dostep ? d.powod : this.powodNiedostepnosci(d.wersja, s);
    return {
      cele: celeCms(),
      dostepny: !powod,
      ...(powod ? { powod } : {}),
      ...(s.domena && s.opublikowanaAt ? { domena: s.domena } : {}),
      wordpress: cms ? this.widok(cms) : null,
    };
  }

  private powodNiedostepnosci(wersja: WersjaKreatora, s: Rekord): string | null {
    if (!PLANY_KREATORA[wersja].wordpress) return 'Przejście na WordPressa jest dostępne po opłaceniu hostingu.';
    if (!s.opublikowanaAt || !s.domena || !s.katalog) return 'Najpierw opublikuj stronę na swojej domenie – WordPress zastąpi stronę opublikowaną z kreatora.';
    return null;
  }

  // ---------------------------------------------------------------------------
  // POST /kreator/strony/:id/cms/wordpress { domena, tryb }
  // ---------------------------------------------------------------------------

  async uruchom(userId: string, actorUserId: string, id: string, dto: { domena: string; tryb: 'podglad' | 'zamiana' }) {
    const d = await this.kreator.dostep(userId);
    if (!d.dostep) throw new ForbiddenException(d.powod);
    const s = await this.wlasna(userId, id);
    const powod = this.powodNiedostepnosci(d.wersja, s);
    if (powod) throw new ForbiddenException(powod);
    const domena = (dto.domena ?? '').trim().toLowerCase().replace(/\.$/, '');
    if (!DOMENA_RE.test(domena)) throw new BadRequestException('Nieprawidłowa domena.');
    if (domena !== s.domena) throw new ConflictException(`Strona jest opublikowana na ${s.domena} – na WordPressa przechodzi ta domena.`);
    const cms = await this.odswiez(await this.prisma.kreatorCms.findUnique({ where: { stronaId: id } }));
    if (cms && W_TOKU.includes(cms.stan)) throw new ConflictException('Poprzednia operacja na WordPressie jeszcze trwa – poczekaj na jej koniec.');
    return dto.tryb === 'zamiana' ? this.zamien(userId, actorUserId, s, cms) : this.podglad(userId, actorUserId, s, d.wersja, cms);
  }

  private async podglad(userId: string, actorUserId: string, s: Rekord, wersja: WersjaKreatora, cms: KreatorCms | null) {
    if (cms?.stan === KreatorCmsStan.PRZENIESIONA) throw new ConflictException('Strona już działa w WordPressie.');
    if (cms?.stan === KreatorCmsStan.PODGLAD) throw new ConflictException('Podgląd WordPressa jest już gotowy – obejrzyj go albo zamień stronę.');
    const strona = this.gotowy(s);
    const domena = s.domena!;
    const konto = await this.konto(userId, s.subskrypcjaId!);
    await this.bezZadaniaWToku(konto.id);
    const uzytkownik = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!uzytkownik?.email) throw new BadRequestException('Konto nie ma adresu e-mail – uzupełnij go w ustawieniach.');

    // 1. Paczka: zdjęcia z biblioteki (wymiary z bazy), fonty z proxy, eksport, ZIP – przed jakąkolwiek zmianą na koncie.
    let model = strona;
    const media = new Map<string, Buffer>();
    const plikiZdjec = new Map<string, Buffer>();
    if (this.zasoby) {
      const z = await this.zasoby.doPublikacji(userId, strona, 'pliki');
      model = z.strona;
      for (const p of z.pliki) plikiZdjec.set(p.sciezka, p.dane);
    }
    const fonty = new Map<string, Buffer>();
    const brakujace: string[] = [];
    for (const n of fontyEksportu(model, { wersja })) {
      try {
        fonty.set(n, (await this.fonty.plikKreatora(n)).buf);
      } catch (e) {
        if (e instanceof BadRequestException && /zakresie znaków/.test(e.message)) brakujace.push(n);
        else {
          this.logger.warn(`Kreator WP – font ${n}: ${e instanceof Error ? e.message : String(e)}`);
          throw new ServiceUnavailableException('Nie udało się przygotować fontów strony – spróbuj ponownie za chwilę.');
        }
      }
    }
    const eksport = eksportujDoCms(model, 'wordpress', { wersja, brakujaceFonty: brakujace, ...this.formularz(s.id) });
    for (const m of eksport.media) {
      const dane = plikiZdjec.get(m.plikPublikacji);
      if (dane) media.set(m.zasobId, dane);
      else eksport.ostrzezenia.push(`Zdjęcie „${m.alt || m.zasobId}” nie jest już w bibliotece – w WordPressie zostanie puste miejsce.`);
    }
    const zip = await zbudujPaczke(eksport, fonty, media);
    if (zip.length > MAKS_PACZKI) throw new BadRequestException('Strona ze zdjęciami jest za duża do przeniesienia jednym krokiem (ponad 120 MB) – usuń część zdjęć i spróbuj ponownie.');

    // 2. Paczka na koncie (katalog domeny, poza public_html) – ten sam mechanizm co publikacja.
    const klucz = randomBytes(12).toString('hex');
    const se = await this.hostingu(() => this.hosting.sesja(userId, s.subskrypcjaId!));
    const k = await this.hostingu(() => se.katalogDomeny(domena));
    if (k.katalog !== s.katalog) throw new ConflictException('Katalog strony domeny zmienił się od publikacji – opublikuj stronę ponownie i spróbuj jeszcze raz.');
    const katalogPaczek = polacz(k.katalogDomeny, KATALOG_PACZEK);
    await this.hostingu(async () => {
      if (!(await se.lista(k.katalogDomeny)).some((w) => w.name === KATALOG_PACZEK)) await se.utworzKatalog(k.katalogDomeny, KATALOG_PACZEK);
      await se.wgraj(katalogPaczek, `${klucz}.zip`, zip);
    });

    // 3. Baza (jak instalator WordPressa) i zadanie węzła.
    const dbKrotka = `wk${randomBytes(3).toString('hex')}`;
    const dbHaslo = haslo();
    let baza: { database: string; username: string };
    try {
      const klient = await this.da.getClientForHostingAccount(konto.id, userId);
      baza = await klient.createMysqlDatabase({ name: dbKrotka, user: dbKrotka, password: dbHaslo });
    } catch (e) {
      this.logger.error(`Kreator WP – baza dla konta ${konto.id}: ${e instanceof Error ? e.message : String(e)}`);
      await se.usun(katalogPaczek, [`${klucz}.zip`]).catch(() => undefined);
      throw new ServiceUnavailableException('Nie udało się utworzyć bazy danych dla WordPressa – sprawdź limit baz w usłudze albo spróbuj ponownie.');
    }
    const adminLogin = `admin_${randomBytes(3).toString('hex')}`;
    const adminHaslo = haslo();
    const zadanie = await this.prisma.nodeTask.create({
      data: {
        serverId: konto.serverId,
        accountId: konto.id,
        kind: NodeTaskKind.KREATOR_WP,
        status: NodeTaskStatus.QUEUED,
        requestedById: actorUserId,
        payload: {
          tryb: 'podglad',
          daUser: konto.daUsername,
          domain: domena,
          dir: k.katalog.replace(/^\/+/, ''),
          klucz,
          paczka: `${k.katalogDomeny.replace(/^\/+/, '')}/${KATALOG_PACZEK}/${klucz}.zip`,
          dbName: baza.database,
          dbUser: baza.username,
          dbPass: dbHaslo,
          adminUser: adminLogin,
          adminPass: adminHaslo,
          adminEmail: uzytkownik.email,
          locale: 'pl_PL',
        },
      },
    });
    const dane = {
      userId,
      cel: 'wordpress',
      stan: KreatorCmsStan.PODGLAD_W_TOKU,
      domena,
      subskrypcjaId: s.subskrypcjaId!,
      katalog: k.katalog,
      klucz,
      zadanieId: zadanie.id,
      bazaNazwa: baza.database,
      bazaUzytkownik: baza.username,
      adminLogin,
      kopia: null,
      kopiaWp: null,
      blad: null,
      bladEtap: null,
      podgladAt: null,
      przeniesionaAt: null,
      cofnietaAt: null,
    };
    const zapis = await this.prisma.kreatorCms.upsert({ where: { stronaId: s.id }, create: { stronaId: s.id, ...dane }, update: dane });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_KREATOR_WP_PODGLAD,
      userId,
      actorUserId,
      details: { subscriptionId: s.subskrypcjaId, stronaId: s.id, domena, taskId: zadanie.id, baza: baza.database, stron: eksport.strony.length, mediow: media.size },
    });
    const w = this.widok(zapis);
    // Dane logowania administratora – tylko w tej odpowiedzi (jak instalator WordPressa); hasło nie jest zapisywane.
    return {
      ...w,
      adminHaslo: adminHaslo,
      ostrzezenia: eksport.ostrzezenia,
      uwaga: 'Zapisz hasło administratora WordPressa – nie pokażemy go ponownie. Instalacja podglądu potrwa kilka minut.',
    };
  }

  private async zamien(userId: string, actorUserId: string, s: Rekord, cms: KreatorCms | null) {
    if (!cms || cms.stan !== KreatorCmsStan.PODGLAD) throw new ConflictException('Najpierw zainstaluj i obejrzyj podgląd WordPressa.');
    const konto = await this.konto(userId, cms.subskrypcjaId);
    await this.bezZadaniaWToku(konto.id);
    const se = await this.hostingu(() => this.hosting.sesja(userId, cms.subskrypcjaId));
    const k = await this.hostingu(() => se.katalogDomeny(cms.domena));
    if (k.katalog !== cms.katalog) throw new ConflictException('Katalog strony domeny zmienił się od instalacji podglądu – zainstaluj podgląd ponownie.');
    const znacznik = odczytajZnacznik(await this.hostingu(() => se.czytaj(polacz(k.katalog, PLIK_ZNACZNIKA), 512 * 1024)));
    if (!znacznik || znacznik.stronaId !== s.id) {
      throw new ConflictException('W katalogu domeny nie ma już tej strony z kreatora – opublikuj ją ponownie albo zainstaluj podgląd od nowa.');
    }
    // Wpisy strony z kreatora (najwyższy poziom katalogu) i znacznik – do kopii. Pliki klienta (np. weryfikacja Google) zostają.
    const pliki = [...new Set([...znacznik.pliki.map((p) => p.split('/')[0]!), PLIK_ZNACZNIKA])].filter((n) => NAZWA_WPISU.test(n) && n !== KATALOG_PODGLADU);
    const istniejace = new Set((await this.hostingu(() => se.lista(k.katalogDomeny))).map((w) => w.name));
    let kopia = nazwaKopii();
    for (let i = 2; istniejace.has(kopia); i++) kopia = `${nazwaKopii()}-${i}`;
    const zadanie = await this.prisma.nodeTask.create({
      data: {
        serverId: konto.serverId,
        accountId: konto.id,
        kind: NodeTaskKind.KREATOR_WP,
        status: NodeTaskStatus.QUEUED,
        requestedById: actorUserId,
        payload: { tryb: 'zamiana', daUser: konto.daUsername, domain: cms.domena, dir: k.katalog.replace(/^\/+/, ''), klucz: cms.klucz, pliki: pliki.join(','), kopia },
      },
    });
    const zapis = await this.prisma.kreatorCms.update({
      where: { id: cms.id },
      data: { stan: KreatorCmsStan.ZAMIANA_W_TOKU, zadanieId: zadanie.id, kopia, blad: null, bladEtap: null },
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_KREATOR_WP_ZAMIANA,
      userId,
      actorUserId,
      details: { subscriptionId: cms.subskrypcjaId, stronaId: s.id, domena: cms.domena, taskId: zadanie.id, kopia: polacz(k.katalogDomeny, kopia) },
    });
    return this.widok(zapis);
  }

  // ---------------------------------------------------------------------------
  // POST /kreator/strony/:id/cms/wordpress/cofnij
  // ---------------------------------------------------------------------------

  async cofnij(userId: string, actorUserId: string, id: string) {
    const s = await this.wlasna(userId, id);
    const cms = await this.odswiez(await this.prisma.kreatorCms.findUnique({ where: { stronaId: id } }));
    if (!cms || cms.stan !== KreatorCmsStan.PRZENIESIONA || !cms.kopia) throw new ConflictException('Strona nie jest przeniesiona do WordPressa.');
    if (!this.cofnijDo(cms)) throw new ConflictException(`Cofnięcie jest możliwe przez ${OKRES_COFNIECIA_DNI} dni od zamiany – ten czas minął.`);
    const konto = await this.konto(userId, cms.subskrypcjaId);
    await this.bezZadaniaWToku(konto.id);
    const se = await this.hostingu(() => this.hosting.sesja(userId, cms.subskrypcjaId));
    const k = await this.hostingu(() => se.katalogDomeny(cms.domena));
    const istniejace = new Set((await this.hostingu(() => se.lista(k.katalogDomeny))).map((w) => w.name));
    if (!istniejace.has(cms.kopia)) throw new ConflictException('Kopii strony z kreatora nie ma już na koncie – cofnięcie niemożliwe. Możesz opublikować stronę z kreatora od nowa po usunięciu WordPressa.');
    const kopiaWp = nazwaKopii().replace(PREFIKS_KOPII, '.verris-wordpress-');
    if (istniejace.has(kopiaWp)) throw new ConflictException('Poczekaj minutę i spróbuj ponownie.');
    const zadanie = await this.prisma.nodeTask.create({
      data: {
        serverId: konto.serverId,
        accountId: konto.id,
        kind: NodeTaskKind.KREATOR_WP,
        status: NodeTaskStatus.QUEUED,
        requestedById: actorUserId,
        payload: { tryb: 'cofnij', daUser: konto.daUsername, domain: cms.domena, dir: cms.katalog.replace(/^\/+/, ''), klucz: cms.klucz, kopia: cms.kopia, kopiaWp },
      },
    });
    const zapis = await this.prisma.kreatorCms.update({
      where: { id: cms.id },
      data: { stan: KreatorCmsStan.COFANIE_W_TOKU, zadanieId: zadanie.id, kopiaWp, blad: null, bladEtap: null },
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_KREATOR_WP_COFNIECIE,
      userId,
      actorUserId,
      details: { subscriptionId: cms.subskrypcjaId, stronaId: s.id, domena: cms.domena, taskId: zadanie.id, kopiaWp: polacz(k.katalogDomeny, kopiaWp) },
    });
    return this.widok(zapis);
  }

  // ---------------------------------------------------------------------------
  // Stan zadań
  // ---------------------------------------------------------------------------

  /** Etap w toku + zadanie zakończone → stan docelowy (albo błąd z komunikatem skryptu dla klienta). */
  async odswiez(cms: KreatorCms | null): Promise<KreatorCms | null> {
    if (!cms || !W_TOKU.includes(cms.stan) || !cms.zadanieId) return cms;
    const z = await this.prisma.nodeTask.findUnique({ where: { id: cms.zadanieId }, select: { status: true, errorMessage: true, outputLog: true } });
    if (!z || z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING) return cms;
    const udane = z.status === NodeTaskStatus.COMPLETED;
    const etap = cms.stan === KreatorCmsStan.PODGLAD_W_TOKU ? 'podglad' : cms.stan === KreatorCmsStan.ZAMIANA_W_TOKU ? 'zamiana' : 'cofniecie';
    const teraz = new Date();
    const blad = udane ? null : `${BLEDY[etap]} ${bladZadaniaDlaKlienta(z.errorMessage ?? 'błąd', z.outputLog) ?? ''}`.trim();
    const dane =
      etap === 'podglad'
        ? udane
          ? { stan: KreatorCmsStan.PODGLAD, podgladAt: teraz }
          : { stan: KreatorCmsStan.BLAD, blad, bladEtap: etap }
        : etap === 'zamiana'
          ? udane
            ? { stan: KreatorCmsStan.PRZENIESIONA, przeniesionaAt: teraz }
            : { stan: KreatorCmsStan.PODGLAD, blad, bladEtap: etap, kopia: null }
          : udane
            ? { stan: KreatorCmsStan.COFNIETA, cofnietaAt: teraz }
            : { stan: KreatorCmsStan.PRZENIESIONA, blad, bladEtap: etap, kopiaWp: null };
    // Warunek na stan i zadanie – dwa równoległe odpytania nie przestawią stanu dwa razy.
    const r = await this.prisma.kreatorCms.updateMany({ where: { id: cms.id, stan: cms.stan, zadanieId: cms.zadanieId }, data: dane });
    if (!r.count) return this.prisma.kreatorCms.findUnique({ where: { id: cms.id } });
    return { ...cms, ...dane } as KreatorCms;
  }

  private cofnijDo(cms: KreatorCms): Date | null {
    if (cms.stan !== KreatorCmsStan.PRZENIESIONA || !cms.przeniesionaAt || !cms.kopia) return null;
    const d = new Date(cms.przeniesionaAt.getTime() + OKRES_COFNIECIA_DNI * DZIEN);
    return d.getTime() > Date.now() ? d : null;
  }

  widok(cms: KreatorCms): WidokCms {
    const podglad = STANY_PODGLADU.includes(cms.stan);
    const naDomenie = STANY_NA_DOMENIE.includes(cms.stan);
    const adres = podglad ? `https://${cms.domena}/${KATALOG_PODGLADU}/${cms.klucz}/` : naDomenie ? `https://${cms.domena}/` : null;
    return {
      cel: 'wordpress',
      stan: cms.stan,
      domena: cms.domena,
      adresPodgladu: podglad ? adres : null,
      adresPanelu: adres ? `${adres}wp-admin/` : null,
      adminLogin: cms.adminLogin,
      blad: cms.blad,
      bladEtap: cms.bladEtap,
      podgladAt: cms.podgladAt,
      przeniesionaAt: cms.przeniesionaAt,
      cofnietaAt: cms.cofnietaAt,
      cofnijDo: this.cofnijDo(cms),
      kopia: cms.kopia,
      kopiaWp: cms.kopiaWp,
    };
  }

  // ---------------------------------------------------------------------------
  // Pomocnicze
  // ---------------------------------------------------------------------------

  private async wlasna(userId: string, id: string): Promise<Rekord> {
    const s = await this.prisma.kreatorStrona.findFirst({ where: { id, userId } });
    if (!s) throw new NotFoundException('Nie znaleziono strony.');
    return s;
  }

  private gotowy(s: Rekord): Strona {
    if (s.status !== KreatorStatus.GOTOWA) throw new ConflictException('Strona nie jest gotowa – poczekaj na koniec generowania albo popraw błędy.');
    const w = walidujStrone(migrujModel(s.model));
    if (!w.ok) throw new ConflictException('Strona ma błędy – popraw je w edytorze i opublikuj ponownie.');
    return w.strona;
  }

  /** Konto hostingu usługi klienta (działające). */
  private async konto(userId: string, subskrypcjaId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subskrypcjaId, userId },
      select: { account: { select: { id: true, serverId: true, daUsername: true, status: true } } },
    });
    if (!sub?.account || sub.account.status !== AccountStatus.ACTIVE) throw new NotFoundException('Nie znaleziono działającej usługi hostingu dla tej domeny.');
    return sub.account;
  }

  private async bezZadaniaWToku(accountId: string): Promise<void> {
    const z = await this.prisma.nodeTask.findFirst({
      where: { accountId, kind: NodeTaskKind.KREATOR_WP, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
      select: { id: true },
    });
    if (z) throw new ConflictException('Na tym koncie trwa już przenoszenie strony na WordPressa – poczekaj na jego koniec.');
  }

  private formularz(stronaId: string): { adresFormularza?: string } {
    const k = this.config.get<string>('appKmsKey');
    if (!k) return {};
    const api = (this.config.get<string>('PUBLIC_API_URL') ?? this.config.get<string>('API_BASE_URL') ?? 'https://api.verris.pl').replace(/\/+$/, '');
    return { adresFormularza: adresFormularza(api, k, stronaId) };
  }

  /** Operacja na plikach konta: błąd serwera plików → komunikat bez szczegółów serwera (white label). */
  private async hostingu<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.logger.warn(`Kreator WP – pliki hostingu: ${e instanceof Error ? e.message : String(e)}`);
      throw new ServiceUnavailableException('Nie udało się zapisać plików na hostingu – spróbuj ponownie za chwilę.');
    }
  }
}

/** 24 znaki base64url – bez cudzysłowów i znaków powłoki (wp-cli, konfiguracja WordPressa). */
function haslo(): string {
  return randomBytes(18).toString('base64url');
}


