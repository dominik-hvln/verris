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
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KreatorStatus, type KreatorStrona } from '@verris/database';
import {
  PLANY_KREATORA,
  ZAKRESY_FONTOW,
  dopasujDoPlanu,
  migrujModel,
  plikFontu,
  walidujStrone,
  zlozPodglad,
  type Strona,
  type WersjaKreatora,
  type WynikRenderu,
  type ZakresFontu,
} from '@verris/kreator';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { HostingResourceActions } from '../common/audit/audit.actions.js';
import { FontsProxyService } from '../fonts-proxy/fonts-proxy.service.js';
import { KreatorService } from './kreator.service.js';
import {
  BladPlikowPublikacji,
  KATALOG_FONTOW,
  PLIK_ZNACZNIKA,
  ROWNOLEGLOSC,
  katalogiPlikow,
  nazwa,
  nazwaKopii,
  naglowkiLinkuPodgladu,
  obceWpisy,
  odczytajZnacznik,
  osierocone,
  polacz,
  rodzic,
  sprawdzPliki,
  stronaKomunikatu,
  tylkoZaslepka,
  wKolejce,
  wstawPasekProby,
  zbudujZnacznik,
  type PlikPublikacji,
  type StanKatalogu,
  type Znacznik,
} from './publikacja.js';
import { sprawdzTokenLinku, utworzTokenLinku } from './publikacja-token.js';
import { adresFormularza } from './formularz-token.js';
import { PLIKI_HOSTINGU_KREATORA, type KatalogDomeny, type PlikiHostingu, type SesjaPlikow } from './pliki-hostingu.js';
import { RENDERER_PUBLIKACJI, type RendererPublikacji } from './renderer-publikacji.js';
import { readmeZip, zbudujZip } from './zip-strony.js';
import { KreatorZasobyService } from './zasoby.service.js';
import { idZasobow } from './zasoby-model.js';
import { POWOD_PRZENIESIONA, STANY_BLOKUJACE_PUBLIKACJE } from './wordpress/stan-cms.js';

/** Link podglądu wersji próbnej – 7 dni, odnawiany kolejną „publikacją”. */
export const WAZNOSC_LINKU_MS = 7 * 24 * 60 * 60 * 1000;
/** Blokada publikacji starsza niż tyle = przerwana (restart API w trakcie). */
export const BLOKADA_PRZERWANA_MS = 15 * 60 * 1000;
const MAKS_ZNACZNIKA = 512 * 1024;
const MAKS_ZASLEPKI = 256 * 1024;
const PACZKA_PRZENIESIENIA = 50;

const NIE_MA_STRONY = 'Nie znaleziono strony.';
const BLAD_HOSTINGU = 'Nie udało się zapisać plików na hostingu – spróbuj ponownie za chwilę. Jeśli problem się powtórzy, napisz do nas.';
const BLAD_FONTOW = 'Nie udało się przygotować fontów strony – spróbuj ponownie za chwilę.';
const TRWA = 'Publikacja tej strony już trwa – poczekaj na jej koniec.';
const DOMENA_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;

type Rekord = KreatorStrona;

/** Błąd z operacji na plikach konta – komunikat dla klienta bez szczegółów serwera (white label). */
class BladHostingu extends Error {}

/**
 * Verris Kreator – publikacja (paczka 121). Wersja 'proba': link podglądu serwowany przez API (bez hostingu klienta).
 * Wersje hosting/pro: pliki renderu i fonty w katalogu strony domeny na koncie klienta, ze znacznikiem
 * `.verris-kreator.json`, kopią poprzedniej zawartości (obok public_html – poza katalogiem WWW) i wycofaniem.
 * Kontrakt: kreator-wspolne-120.md (GET publikacja, POST publikuj/wycofaj, GET zip).
 */
@Injectable()
export class KreatorPublikacjaService {
  private readonly logger = new Logger(KreatorPublikacjaService.name);
  private readonly wToku = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly kreator: KreatorService,
    private readonly audit: AuditService,
    private readonly fonty: FontsProxyService,
    @Inject(PLIKI_HOSTINGU_KREATORA) private readonly hosting: PlikiHostingu,
    @Inject(RENDERER_PUBLIKACJI) private readonly renderer: RendererPublikacji,
    // Paczka 122 – zdjęcia z biblioteki. Opcjonalny tylko dla testów stron bez zdjęć (model ze zdjęciem bez serwisu = błąd).
    @Optional() private readonly zasoby?: KreatorZasobyService,
  ) {}

  // ---------------------------------------------------------------------------
  // GET /kreator/strony/:id/publikacja
  // ---------------------------------------------------------------------------

  async stan(userId: string, id: string) {
    const wersja = await this.wersja(userId);
    const s = await this.wlasna(userId, id);
    const model = this.model(s);
    const plan = PLANY_KREATORA[wersja];
    const zmianyPlanu = model ? dopasujDoPlanu(model, wersja).zmiany : [];
    const opublikowana = s.opublikowanaAt && s.adres ? { adres: s.adres, at: s.opublikowanaAt, ...(s.domena ? { domena: s.domena } : {}) } : undefined;
    const link = s.podgladDo && s.podgladDo.getTime() > Date.now() ? { adres: this.adresLinku(s.id, s.podgladDo), wazneDo: s.podgladDo } : undefined;
    const niegotowa = model ? null : 'Strona nie jest jeszcze gotowa – poczekaj na koniec generowania albo popraw błędy.';

    // Paczka 124 – strona przeniesiona do WordPressa: kreator nie publikuje na jej domenę (dopóki klient nie cofnie przejścia).
    if (await this.przeniesionaDoCms(id)) {
      return { wersja, mozliwa: false, powod: POWOD_PRZENIESIONA, domeny: [], zmianyPlanu, ...(opublikowana ? { opublikowana } : {}) };
    }
    if (plan.publikacja === 'podglad') {
      return { wersja, mozliwa: !niegotowa, ...(niegotowa ? { powod: niegotowa } : {}), domeny: [], zmianyPlanu, ...(opublikowana ? { opublikowana } : {}), ...(link ? { linkPodgladu: link } : {}) };
    }
    const domeny = await this.hosting.domenyKlienta(userId).catch((e: unknown) => {
      this.logger.warn(`Domeny klienta ${userId}: ${String(e)}`);
      return [];
    });
    const sesje = new Map<string, Promise<SesjaPlikow | null>>();
    const sesja = (sub: string) => {
      if (!sesje.has(sub)) sesje.set(sub, this.hosting.sesja(userId, sub).catch(() => null));
      return sesje.get(sub)!;
    };
    const lista = await wKolejce(domeny, ROWNOLEGLOSC, async (d) => {
      let stan: StanKatalogu = 'nieznany';
      if (!d.niepewna) {
        const se = await sesja(d.subskrypcjaId);
        if (se) stan = await this.stanKatalogu(se, d.domena, id).catch(() => 'nieznany' as const);
      }
      return { domena: d.domena, subskrypcjaId: d.subskrypcjaId, stan };
    });
    const powod = niegotowa ?? (lista.length ? null : 'Nie masz domeny na opłaconym hostingu Verris – dodaj domenę do usługi hostingu, żeby opublikować stronę.');
    return {
      wersja,
      mozliwa: !powod,
      ...(powod ? { powod } : {}),
      domeny: lista,
      zmianyPlanu,
      ...(opublikowana ? { opublikowana } : {}),
      ...(link ? { linkPodgladu: link } : {}),
    };
  }

  private async stanKatalogu(se: SesjaPlikow, domena: string, stronaId: string): Promise<StanKatalogu> {
    const k = await se.katalogDomeny(domena);
    const b = await this.badajKatalog(se, k, stronaId);
    if (b.znacznik?.stronaId === stronaId) return 'kreator';
    return b.obce.length && !b.zaslepka ? 'zajeta' : 'pusta';
  }

  // ---------------------------------------------------------------------------
  // POST /kreator/strony/:id/publikuj
  // ---------------------------------------------------------------------------

  async publikuj(userId: string, actorUserId: string, id: string, dto: { domena?: string; zastap?: boolean }) {
    const wersja = await this.wersja(userId);
    const s = await this.wlasna(userId, id);
    const strona = this.gotowy(s);
    if (PLANY_KREATORA[wersja].publikacja === 'podglad') {
      if (dto.domena) {
        throw new ForbiddenException('W okresie próbnym strona jest dostępna pod linkiem podglądu. Własną domenę podłączysz po opłaceniu hostingu.');
      }
      return this.utworzLink(s);
    }

    if (await this.przeniesionaDoCms(id)) throw new ConflictException(POWOD_PRZENIESIONA);
    const domena = (dto.domena ?? '').trim().toLowerCase().replace(/\.$/, '');
    if (!domena) throw new BadRequestException('Wybierz domenę, na której ma się pojawić strona.');
    if (!DOMENA_RE.test(domena)) throw new BadRequestException('Nieprawidłowa domena.');
    const d = (await this.hosting.domenyKlienta(userId)).find((x) => x.domena === domena);
    if (!d) throw new NotFoundException('Nie znaleziono tej domeny na Twoim opłaconym hostingu Verris.');
    if (s.opublikowanaAt && s.domena && s.domena !== domena) {
      throw new ConflictException(`Strona jest opublikowana na ${s.domena}. Najpierw wycofaj tamtą publikację.`);
    }

    return this.zBlokada(id, async () => {
      // Render, fonty i zdjęcia przed pierwszą operacją na koncie – zły render (ścieżki, limity) nie dotyka hostingu.
      const z = await this.zdjecia(userId, strona, 'pliki');
      const wynik = this.renderer.renderuj(z.strona, { wersja, adresStrony: `https://${domena}`, bazaFontow: KATALOG_FONTOW, ...this.formularz(id), ...z.opcje });
      const { pliki, ostrzezenia } = await this.plikiPublikacji(wynik, z.pliki);
      const nowe = pliki.map((p) => p.sciezka);
      const se = await this.hostingu(() => this.hosting.sesja(userId, d.subskrypcjaId));
      const k = await this.hostingu(() => se.katalogDomeny(domena));

      const b = await this.hostingu(() => this.badajKatalog(se, k, id));
      // Katalog tej strony (znacznik pasuje): pliki dorzucone przez klienta (np. weryfikacja Google) zostają na miejscu.
      if (b.znacznik?.stronaId === id) b.obce = [];
      if (b.obce.length && !b.zaslepka && !dto.zastap) {
        throw new ConflictException({
          kod: 'KATALOG_ZAJETY',
          message: `Na ${domena} są już pliki innej strony. Zastąp je – przeniesiemy je do kopii, którą przywrócisz wycofaniem publikacji.`,
          pliki: b.obce.slice(0, 20).map((w) => (w.type === 'dir' ? `${w.name}/` : w.name)),
        });
      }

      // 1. Kopia obecnej zawartości (obok public_html, poza WWW) – zanim dotkniemy czegokolwiek.
      let kopia: string | null = null;
      if (b.obce.length) {
        kopia = await this.hostingu(() => this.zrobKopie(se, k, b.obce.map((w) => w.name)));
        await this.prisma.kreatorStrona.update({ where: { id }, data: { kopia, katalog: k.katalog, subskrypcjaId: d.subskrypcjaId, domena } });
      }
      const stare = b.znacznik?.stronaId === id ? b.znacznik.pliki : [];
      // 2. Znacznik „w toku” – przerwana publikacja zostawia pliki rozpoznawalne jako pliki tej strony.
      await this.hostingu(() => se.zapiszTekst(k.katalog, PLIK_ZNACZNIKA, zbudujZnacznik(id, [...stare, ...nowe], true)));
      // 3. Pliki: katalogi, potem zasoby, podstrony i na końcu strona główna (odwiedzający nie trafi na HTML bez CSS).
      await this.hostingu(() => this.zapiszPliki(se, k.katalog, pliki, new Set(stare)));
      // 4. Osierocone pliki poprzedniej publikacji.
      await this.hostingu(() => this.usunPliki(se, k.katalog, osierocone(stare, nowe)));
      // 5. Znacznik końcowy.
      await this.hostingu(() => se.zapiszTekst(k.katalog, PLIK_ZNACZNIKA, zbudujZnacznik(id, nowe)));

      const adres = `https://${domena}/`;
      const at = new Date();
      await this.prisma.kreatorStrona.update({
        where: { id },
        data: { opublikowanaAt: at, domena, adres, katalog: k.katalog, subskrypcjaId: d.subskrypcjaId, ...(kopia ? { kopia } : {}) },
      });
      // Inna strona tego konta, która była w tym katalogu, przestała być opublikowana (jej pliki są w kopii).
      await this.prisma.kreatorStrona.updateMany({
        where: { userId, id: { not: id }, katalog: k.katalog, subskrypcjaId: d.subskrypcjaId },
        data: { opublikowanaAt: null, adres: null, katalog: null, subskrypcjaId: null, domena: null, kopia: null },
      });
      await this.audit.record({
        action: HostingResourceActions.HOSTING_KREATOR_PUBLISHED,
        userId,
        actorUserId,
        details: { subscriptionId: d.subskrypcjaId, stronaId: id, domena, katalog: k.katalog, pliki: nowe.length, kopia },
      });
      const kopiaDlaKlienta = kopia ?? s.kopia;
      return {
        adres,
        pliki: nowe.length,
        ostrzezenia,
        tryb: 'domena' as const,
        ...(kopiaDlaKlienta ? { kopia: kopiaDlaKlienta.replace(/^\/+/, '') } : {}),
      };
    });
  }

  private async utworzLink(s: Rekord) {
    const wazneDo = new Date(Math.floor((Date.now() + WAZNOSC_LINKU_MS) / 1000) * 1000);
    await this.prisma.kreatorStrona.update({ where: { id: s.id }, data: { podgladDo: wazneDo } });
    return { adres: this.adresLinku(s.id, wazneDo), wazneDo, tryb: 'podglad' as const };
  }

  // ---------------------------------------------------------------------------
  // POST /kreator/strony/:id/wycofaj
  // ---------------------------------------------------------------------------

  async wycofaj(userId: string, actorUserId: string, id: string) {
    const s = await this.wlasna(userId, id);
    // Katalog strony należy teraz do WordPressa – wycofanie publikacji usunęłoby pliki, których kreator już nie ma.
    if (await this.przeniesionaDoCms(id)) throw new ConflictException(POWOD_PRZENIESIONA);
    if (!s.katalog || !s.subskrypcjaId) {
      if (!s.podgladDo && !s.opublikowanaAt) throw new ConflictException('Strona nie jest opublikowana.');
      await this.prisma.kreatorStrona.update({ where: { id }, data: { podgladDo: null, opublikowanaAt: null, adres: null } });
      return { ok: true as const, tryb: 'podglad' as const, przywrocono: false, usunieto: 0 };
    }
    const katalog = s.katalog;
    const subskrypcjaId = s.subskrypcjaId;
    return this.zBlokada(id, async () => {
      const se = await this.hostingu(() => this.hosting.sesja(userId, subskrypcjaId));
      const znacznik = await this.hostingu(() => this.czytajZnacznik(se, katalog));
      if (znacznik && znacznik.stronaId !== id) {
        // W katalogu jest już inna strona z kreatora – niczego nie usuwamy ani nie przywracamy (kopia zostaje na koncie).
        await this.prisma.kreatorStrona.update({ where: { id }, data: { opublikowanaAt: null, adres: null, podgladDo: null, kopia: null, katalog: null, subskrypcjaId: null, domena: null } });
        return { ok: true as const, tryb: 'domena' as const, przywrocono: false, usunieto: 0 };
      }
      let usunieto = 0;
      if (znacznik) {
        const grupy = osierocone(znacznik.pliki, []);
        await this.hostingu(() => this.usunPliki(se, katalog, grupy));
        await this.hostingu(() => se.usun(katalog, [PLIK_ZNACZNIKA]));
        usunieto = znacznik.pliki.length;
      }
      await this.prisma.kreatorStrona.update({ where: { id }, data: { opublikowanaAt: null, adres: null, podgladDo: null } });
      let przywrocono = false;
      if (s.kopia) {
        const kopia = s.kopia;
        await this.hostingu(async () => {
          const wpisy = await se.lista(kopia);
          const nazwy = wpisy.map((w) => w.name);
          for (let i = 0; i < nazwy.length; i += PACZKA_PRZENIESIENIA) await se.przenies(kopia, nazwy.slice(i, i + PACZKA_PRZENIESIENIA), katalog);
          await se.usun(rodzic(kopia) || '/', [nazwa(kopia)]);
        });
        przywrocono = true;
      }
      await this.prisma.kreatorStrona.update({ where: { id }, data: { kopia: null, katalog: null, subskrypcjaId: null, domena: null } });
      await this.audit.record({
        action: HostingResourceActions.HOSTING_KREATOR_UNPUBLISHED,
        userId,
        actorUserId,
        details: { subscriptionId: subskrypcjaId, stronaId: id, domena: s.domena, katalog, usunieto, przywrocono },
      });
      return { ok: true as const, tryb: 'domena' as const, przywrocono, usunieto };
    });
  }

  // ---------------------------------------------------------------------------
  // GET /kreator/strony/:id/zip
  // ---------------------------------------------------------------------------

  async zip(userId: string, id: string): Promise<{ nazwa: string; dane: Buffer }> {
    const wersja = await this.wersja(userId);
    if (!PLANY_KREATORA[wersja].zip) {
      throw new ForbiddenException('Pobranie strony w pliku ZIP jest dostępne po opłaceniu hostingu.');
    }
    const s = await this.wlasna(userId, id);
    const strona = this.gotowy(s);
    // Formularz w ZIP wysyła do Verris (token strony) – tylko gdy strona jest opublikowana na domenie; inaczej wyłączony.
    const formularz = s.opublikowanaAt && s.domena ? this.formularz(id) : {};
    const z = await this.zdjecia(userId, strona, 'pliki');
    const wynik = this.renderer.renderuj(z.strona, { wersja, ...(s.domena ? { adresStrony: `https://${s.domena}` } : {}), bazaFontow: KATALOG_FONTOW, ...formularz, ...z.opcje });
    const { pliki } = await this.plikiPublikacji(wynik, z.pliki);
    pliki.push({ sciezka: 'README.txt', dane: Buffer.from(readmeZip(!!formularz.adresFormularza), 'utf8'), tekst: true });
    return { nazwa: s.nazwa, dane: await zbudujZip(pliki) };
  }

  // ---------------------------------------------------------------------------
  // GET /kreator/p/:token[/:podstrona] – publiczny link podglądu wersji próbnej
  // ---------------------------------------------------------------------------

  async stronaLinku(token: string, podstrona: string | null): Promise<{ status: number; html: string; naglowki: Record<string, string> }> {
    const bazaFontow = `${this.publicznyAdresApi()}/fonts/kreator`;
    const komunikat = (status: number, tytul: string, tresc: string) => {
      const html = stronaKomunikatu(tytul, tresc);
      return { status, html, naglowki: naglowkiLinkuPodgladu(html, bazaFontow) };
    };
    const nieDziala = () => komunikat(404, 'Ten link nie działa', 'Link podglądu jest nieprawidłowy albo strona została usunięta. Poproś autora strony o nowy link.');
    const t = sprawdzTokenLinku(this.klucz(), token);
    if (t.stan === 'zly') return nieDziala();
    const s = await this.prisma.kreatorStrona.findUnique({ where: { id: t.stronaId } });
    // Link wydany przed odnowieniem jest ważny do swojego terminu; wycofanie (podgladDo = null) unieważnia wszystkie.
    if (!s || !s.podgladDo || t.wazneDo.getTime() > s.podgladDo.getTime()) {
      return s ? komunikat(410, 'Link wygasł', 'Ten podgląd strony nie jest już dostępny. Poproś autora strony o nowy link.') : nieDziala();
    }
    if (t.stan === 'wygasl') return komunikat(410, 'Link wygasł', 'Link podglądu był ważny 7 dni. Poproś autora strony o nowy link.');
    const strona = this.model(s);
    if (!strona || podstrona === null || !strona.strony.some((p) => p.slug === podstrona)) return komunikat(404, 'Nie znaleziono strony', 'Ta podstrona nie istnieje.');
    let z: Awaited<ReturnType<KreatorPublikacjaService['zdjecia']>>;
    try {
      z = await this.zdjecia(s.userId, strona, 'adresy');
    } catch {
      return komunikat(404, 'Nie znaleziono strony', 'Ta strona jest chwilowo niedostępna. Poproś autora strony o nowy link.');
    }
    const wynik = this.renderer.renderuj(z.strona, { wersja: 'proba', bazaFontow, noindex: true, ...z.opcje });
    const zlozony = zlozPodglad(wynik.pliki, podstrona);
    if (zlozony === null) return komunikat(404, 'Nie znaleziono strony', 'Ta podstrona nie istnieje.');
    const html = wstawPasekProby(zlozony);
    return { status: 200, html, naglowki: naglowkiLinkuPodgladu(html, bazaFontow) };
  }

  // ---------------------------------------------------------------------------
  // Pliki
  // ---------------------------------------------------------------------------

  /**
   * Zdjęcia z biblioteki w modelu (paczka 122): wymiary z bazy, adresZasobu dla renderu i – przy publikacji na domenę
   * i ZIP – warianty do assets/img. Bez zdjęć w modelu nic nie robi.
   */
  private async zdjecia(userId: string, strona: Strona, tryb: 'pliki' | 'adresy') {
    if (!idZasobow(strona).length) return { strona, opcje: {}, pliki: [] as PlikPublikacji[] };
    if (!this.zasoby) throw new ServiceUnavailableException('Zdjęcia są chwilowo niedostępne – spróbuj za chwilę.');
    const z = await this.zasoby.doPublikacji(userId, strona, tryb);
    return { strona: z.strona, opcje: z.adresZasobu ? { adresZasobu: z.adresZasobu } : {}, pliki: z.pliki };
  }

  /** Render → pliki do zapisu (HTML/CSS/JS…) + fonty z proxy + zdjęcia; ścieżki i limity sprawdzone. */
  async plikiPublikacji(wynik: WynikRenderu, zdjecia: PlikPublikacji[] = []): Promise<{ pliki: PlikPublikacji[]; ostrzezenia: string[] }> {
    const ostrzezenia = [...wynik.ostrzezenia];
    const pliki: PlikPublikacji[] = [...wynik.pliki.map((p) => ({ sciezka: p.sciezka, dane: Buffer.from(p.tresc, 'utf8'), tekst: true })), ...zdjecia];
    // Ścieżki z renderu sprawdzamy przed pobieraniem fontów – złośliwy render nie wywoła żadnej operacji.
    this.sprawdz(pliki);
    const nazwy = new Set<string>();
    for (const f of wynik.fonty) {
      for (const w of f.wagi) {
        for (const kurs of f.kursywa ? [false, true] : [false]) {
          for (const z of Object.keys(ZAKRESY_FONTOW) as ZakresFontu[]) nazwy.add(plikFontu(f.rodzina, w, kurs, z));
        }
      }
    }
    const fonty = await wKolejce([...nazwy], ROWNOLEGLOSC, async (n) => {
      try {
        return { n, buf: (await this.fonty.plikKreatora(n)).buf };
      } catch (e) {
        // Krój bez danego zakresu znaków (np. bez latin-ext) – przeglądarka użyje kroju zapasowego dla tych znaków.
        if (e instanceof BadRequestException && /zakresie znaków/.test(e.message)) return { n, buf: null };
        this.logger.warn(`Font ${n}: ${e instanceof Error ? e.message : String(e)}`);
        throw new ServiceUnavailableException(BLAD_FONTOW);
      }
    });
    for (const f of fonty) {
      if (f.buf) pliki.push({ sciezka: `${KATALOG_FONTOW}/${f.n}`, dane: f.buf, tekst: false });
      else ostrzezenia.push(`Font ${f.n.replace(/\.woff2$/, '')} nie ma tego zakresu znaków – użyty będzie krój zapasowy.`);
    }
    this.sprawdz(pliki);
    return { pliki, ostrzezenia: [...new Set(ostrzezenia)] };
  }

  private sprawdz(pliki: PlikPublikacji[]): void {
    try {
      sprawdzPliki(pliki);
    } catch (e) {
      if (e instanceof BladPlikowPublikacji) {
        this.logger.error(`Render publikacji odrzucony: ${e.message}`);
        throw new UnprocessableEntityException(e.message);
      }
      throw e;
    }
  }

  private async czytajZnacznik(se: SesjaPlikow, katalog: string): Promise<Znacznik | null> {
    return odczytajZnacznik(await se.czytaj(polacz(katalog, PLIK_ZNACZNIKA), MAKS_ZNACZNIKA));
  }

  /** Zawartość katalogu strony: znacznik, cudze wpisy, czy cudze to tylko zaślepka nowej domeny. */
  private async badajKatalog(se: SesjaPlikow, k: KatalogDomeny, stronaId: string) {
    const wpisy = await se.lista(k.katalog);
    const znacznik = wpisy.some((w) => w.name === PLIK_ZNACZNIKA) ? await this.czytajZnacznik(se, k.katalog) : null;
    const obce = obceWpisy(wpisy, znacznik, stronaId, k.chronione);
    let zaslepka = false;
    if (obce.length && obce.length <= 3 && obce.some((w) => w.name === 'index.html')) {
      const index = await se.czytaj(polacz(k.katalog, 'index.html'), MAKS_ZASLEPKI);
      const assets = obce.some((w) => w.name === 'assets' && w.type === 'dir') ? await se.lista(polacz(k.katalog, 'assets')) : null;
      zaslepka = tylkoZaslepka(obce, index, assets);
    }
    return { znacznik, obce, zaslepka };
  }

  /** Przenosi cudze wpisy do `/domains/<domena>/.verris-kopia-…` (katalog domeny, poza public_html). */
  private async zrobKopie(se: SesjaPlikow, k: KatalogDomeny, nazwy: string[]): Promise<string> {
    const istniejace = new Set((await se.lista(k.katalogDomeny)).map((w) => w.name));
    let n = nazwaKopii();
    for (let i = 2; istniejace.has(n); i++) n = `${nazwaKopii()}-${i}`;
    await se.utworzKatalog(k.katalogDomeny, n);
    const kopia = polacz(k.katalogDomeny, n);
    for (let i = 0; i < nazwy.length; i += PACZKA_PRZENIESIENIA) await se.przenies(k.katalog, nazwy.slice(i, i + PACZKA_PRZENIESIENIA), kopia);
    return kopia;
  }

  private async zapiszPliki(se: SesjaPlikow, katalog: string, pliki: PlikPublikacji[], poprzednie: Set<string>): Promise<void> {
    // Katalogi: listujemy rodzica raz i zakładamy brakujące (rodzice przed dziećmi).
    const listy = new Map<string, Set<string>>();
    for (const kat of katalogiPlikow(pliki.map((p) => p.sciezka))) {
      const r = rodzic(kat);
      if (!listy.has(r)) listy.set(r, new Set((await se.lista(polacz(katalog, r))).map((w) => w.name)));
      if (!listy.get(r)!.has(nazwa(kat))) {
        await se.utworzKatalog(polacz(katalog, r), nazwa(kat));
        listy.get(r)!.add(nazwa(kat));
        listy.set(kat, new Set()); // nowy katalog jest pusty – bez listowania
      }
    }
    const waga = (p: PlikPublikacji) => (p.sciezka === 'index.html' ? 3 : p.sciezka.endsWith('.html') ? 2 : 1);
    const kolejnosc = [...pliki].sort((a, b) => waga(a) - waga(b));
    const zasoby = kolejnosc.filter((p) => waga(p) === 1);
    const podstrony = kolejnosc.filter((p) => waga(p) === 2);
    const glowna = kolejnosc.filter((p) => waga(p) === 3);
    const zapisz = async (p: PlikPublikacji) => {
      const kat = polacz(katalog, rodzic(p.sciezka));
      if (p.tekst) return se.zapiszTekst(kat, nazwa(p.sciezka), p.dane.toString('utf8'));
      // Fonty i zdjęcia (assets/img/<id>-<szer>.<format>): nazwa wyznacza treść – plik z poprzedniej publikacji zostaje.
      if (poprzednie.has(p.sciezka)) return;
      return se.wgraj(kat, nazwa(p.sciezka), p.dane);
    };
    for (const grupa of [zasoby, podstrony, glowna]) await wKolejce(grupa, ROWNOLEGLOSC, zapisz);
  }

  /** Usuwa pliki pogrupowane po katalogu; katalog, który po tym jest pusty, też (nie usuwa plików klienta). */
  private async usunPliki(se: SesjaPlikow, katalog: string, grupy: Map<string, string[]>): Promise<void> {
    const katalogi = [...grupy.keys()].sort((a, b) => b.split('/').length - a.split('/').length);
    for (const kat of katalogi) await se.usun(polacz(katalog, kat), grupy.get(kat)!);
    // Puste katalogi kreatora od najgłębszych (np. „o-nas” po usunięciu podstrony).
    const kandydaci = new Set<string>();
    for (const kat of katalogi) {
      const czesci = kat ? kat.split('/') : [];
      for (let i = czesci.length; i > 0; i--) kandydaci.add(czesci.slice(0, i).join('/'));
    }
    for (const kat of [...kandydaci].sort((a, b) => b.split('/').length - a.split('/').length)) {
      const zawartosc = await se.lista(polacz(katalog, kat)).catch(() => null);
      if (zawartosc && zawartosc.length === 0) await se.usun(polacz(katalog, rodzic(kat)), [nazwa(kat)]);
    }
  }

  /**
   * Operacja na plikach konta: błąd serwera plików → polski komunikat bez szczegółów (white label), szczegóły w logu.
   * Wyjątki HTTP (np. „Domena nie należy do tej usługi.”) przechodzą bez zmian – mają już komunikat dla klienta.
   */
  private async hostingu<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.logger.warn(`Publikacja kreatora – pliki hostingu: ${e instanceof Error ? e.message : String(e)}`);
      throw new BladHostingu(BLAD_HOSTINGU);
    }
  }

  /** Blokada równoległych publikacji tej samej strony: w pamięci i w bazie (publikacjaOd, między replikami). */
  private async zBlokada<T>(id: string, fn: () => Promise<T>): Promise<T> {
    if (this.wToku.has(id)) throw new ConflictException(TRWA);
    this.wToku.add(id);
    try {
      const r = await this.prisma.kreatorStrona.updateMany({
        where: { id, OR: [{ publikacjaOd: null }, { publikacjaOd: { lt: new Date(Date.now() - BLOKADA_PRZERWANA_MS) } }] },
        data: { publikacjaOd: new Date() },
      });
      if (!r.count) throw new ConflictException(TRWA);
      try {
        return await fn();
      } catch (e) {
        if (e instanceof BladHostingu) throw new ServiceUnavailableException(e.message);
        throw e;
      } finally {
        await this.prisma.kreatorStrona.updateMany({ where: { id }, data: { publikacjaOd: null } }).catch(() => undefined);
      }
    } finally {
      this.wToku.delete(id);
    }
  }

  // ---------------------------------------------------------------------------
  // Pomocnicze
  // ---------------------------------------------------------------------------

  private async przeniesionaDoCms(stronaId: string): Promise<boolean> {
    const c = await this.prisma.kreatorCms.findUnique({ where: { stronaId }, select: { stan: true } });
    return !!c && STANY_BLOKUJACE_PUBLIKACJE.includes(c.stan);
  }

  private async wersja(userId: string): Promise<WersjaKreatora> {
    const d = await this.kreator.dostep(userId);
    if (!d.dostep) throw new ForbiddenException(d.powod);
    return d.wersja;
  }

  private async wlasna(userId: string, id: string): Promise<Rekord> {
    const s = await this.prisma.kreatorStrona.findFirst({ where: { id, userId } });
    if (!s) throw new NotFoundException(NIE_MA_STRONY);
    return s;
  }

  private model(s: Rekord): Strona | null {
    if (s.status !== KreatorStatus.GOTOWA) return null;
    const w = walidujStrone(migrujModel(s.model));
    return w.ok ? w.strona : null;
  }

  private gotowy(s: Rekord): Strona {
    if (s.status === KreatorStatus.GENEROWANIE) throw new ConflictException('Strona jest jeszcze generowana – poczekaj na koniec.');
    const m = this.model(s);
    if (!m) throw new ConflictException('Strona nie jest jeszcze gotowa – wygeneruj ją ponownie albo popraw błędy.');
    return m;
  }

  /** Adres POST formularza kontaktowego (token HMAC strony) – bez klucza aplikacji formularz zostaje wyłączony. */
  private formularz(stronaId: string): { adresFormularza?: string } {
    const k = this.config.get<string>('appKmsKey');
    return k ? { adresFormularza: adresFormularza(this.publicznyAdresApi(), k, stronaId) } : {};
  }

  private adresLinku(stronaId: string, wazneDo: Date): string {
    return `${this.publicznyAdresApi()}/kreator/p/${utworzTokenLinku(this.klucz(), stronaId, wazneDo)}/`;
  }

  private klucz(): string {
    const k = this.config.get<string>('appKmsKey');
    if (!k) throw new ServiceUnavailableException('Podgląd jest chwilowo niedostępny.');
    return k;
  }

  private publicznyAdresApi(): string {
    return (this.config.get<string>('PUBLIC_API_URL') ?? this.config.get<string>('API_BASE_URL') ?? 'https://api.verris.pl').replace(/\/+$/, '');
  }
}

