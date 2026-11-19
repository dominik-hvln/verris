// Kreator marki – analiza wgranego logo: kolory dominujące (k-means OKLab), gradient, cień, własna wektoryzacja.
export { kolorySzkieletowe, wykryjCien, wykryjGradient, type KolorObrazu, type KoloryObrazu, type Piksele } from './kolory-obrazu.ts';
export {
  porownajWektor,
  rasteryzujWektor,
  wektoryzuj,
  zgodnoscMasek,
  type KanalKoloru,
  type OpcjeWektoryzacji,
  type SciezkaWektora,
  type WynikWektoryzacji,
} from './wektoryzacja.ts';
