import type { MaterialSvg, WejscieKv } from './wspolne.ts';
import { banerLinkedin, okladkaFacebook, post, story, zaproszenieTeams } from './social.ts';
import { naklejka, papierFirmowy, wizytowka } from './druk.ts';

export type { KoloryKv, KsztaltyKv, MaterialSvg, WejscieKv } from './wspolne.ts';
export { bezpiecznyUrlZdjecia, koloryKv, zawin as zawinHaslo } from './wspolne.ts';
export {
  WYMIARY_SOCIAL,
  banerLinkedin as kvBanerLinkedin,
  okladkaFacebook as kvOkladkaFacebook,
  post as kvPost,
  story as kvStory,
  zaproszenieTeams as kvZaproszenieTeams,
} from './social.ts';
export {
  A4,
  NAKLEJKA,
  WIZYTOWKA,
  linieCiecia,
  naklejka as kvNaklejka,
  papierFirmowy as kvPapierFirmowy,
  wizytowka as kvWizytowka,
  type OpcjeDruku,
  type Wizytowka,
} from './druk.ts';

/** Wszystkie materiały KV (SVG) jednym wywołaniem – do eksportu ZIP i podglądu w panelu. */
export function materialyKv(we: WejscieKv): MaterialSvg[] {
  const w = wizytowka(we);
  return [post(we), story(we), okladkaFacebook(we), banerLinkedin(we), zaproszenieTeams(we), w.przod, w.tyl, papierFirmowy(we), naklejka(we)];
}
