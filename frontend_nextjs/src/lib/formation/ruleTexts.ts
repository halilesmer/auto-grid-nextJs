/**
 * Kurztexte der Bedingungen je ID und Sprache (Reihenfolge tr, en, de). Eigene Formulierungen der gemessenen Regel;
 * die Zahlen stehen in params.ts. Liegt hier keine ID, zeigt die Checkliste nur die ID.
 * Bei Ereignis-Bedingungen (Ausschlüsse) heißt „erfüllt“: das Ereignis liegt vor.
 */
import type { Locale } from '@/i18n';

type Text = readonly [tr: string, en: string, de: string];

const FRACTAL_AB: Text = ['X ve A tamamlanmış fraktal, X→A bir itki', 'X and A are finished fractals, X→A is an impulse', 'X und A sind fertige Fraktale, X→A ist ein Impuls'];
const ALT: Text = ['Noktalar sırayla yön değiştirir', 'The points alternate in direction', 'Die Punkte wechseln die Richtung ab'];
const SPACE: Text = ['X→D yeterince uzun ve yüksek', 'X→D is long and high enough', 'X→D ist lang und hoch genug'];
const HIGH_TF: Text = ['Zaman dilimi H4 veya D1', 'Timeframe is H4 or D1', 'Zeiteinheit ist H4 oder D1'];
const RSI_D: Text = ['D noktasında RSI(7) uç bölgede', 'RSI(7) at D is in the extreme zone', 'RSI(7) bei D im Extrem'];
const DIV_D: Text = ['D noktasında Wave sapması', 'Wave divergence at D', 'Wave-Divergenz bei D'];
const ZONE_D_IN: Text = ['D bir bölgenin içinde', 'D lies inside a zone', 'D liegt in einer Zone'];
const PRZ: Text = ['PRZ seviyesi D’ye yakın', 'The PRZ level is near D', 'PRZ-Level liegt nahe D'];
const CLOSE_X: Text = ['H4 kapanışı X’in ötesinde', 'An H4 close beyond X', 'H4-Schluss jenseits von X'];

export const RULE_TEXTS: Record<string, Text> = {
  'ABCD-01': ['A, B, C sırayla fitil uçlarında', 'A, B, C follow in order on wick ends', 'A, B, C folgen der Reihe nach an Dochtspitzen'],
  'ABCD-02': ['B ve C tamamlanmış fraktal', 'B and C are finished fractals', 'B und C sind fertige Fraktale'],
  'ABCD-03': ['C’den sonra bir mum B’nin ötesinde kapanır', 'A candle after C closes beyond B', 'Eine Kerze nach C schließt jenseits von B'],
  'ABCD-04': ['BC düzeltmesi en az 0,382', 'The BC correction is at least 0.382', 'Korrektur BC mindestens 0,382'],
  'ABCD-05': ['BC düzeltmesi en fazla 1,0', 'The BC correction is at most 1.0', 'Korrektur BC höchstens 1,0'],
  'ABCD-06': ['Seviye 1, AB’nin −0,272 uzantısına ulaşır', 'Level 1 reaches the −0.272 extension of AB', 'Level 1 erreicht die Verlängerung −0,272 von AB'],
  'ABCD-07': ['D’nin fitili Seviye 1’e ulaşır (sıkı)', 'The wick of D reaches level 1 (strict)', 'Docht von D erreicht Level 1 (streng)'],
  'ABCD-08': ['D, Seviye 1’e %5 AB toleransıyla ulaşır', 'D reaches level 1 within 5 % of AB', 'D erreicht Level 1 mit 5 % von AB Toleranz'],
  'ABCD-09': ['İç hareketin Seviye 1’i bizimkine yakın', 'The level 1 of an inner move is near ours', 'Level 1 einer inneren Bewegung liegt nahe unserem'],
  'ABCD-10': ['D bir bölgede veya birleşme noktasında', 'D lies in a zone or at a confluence', 'D liegt in einer Zone oder an einer Konfluenz'],
  'ABCD-11': ['Yakınlık ATR ile ölçülebilir', 'Nearness can be measured in ATR', 'Nähe ist in ATR messbar'],
  'ABCD-12': ['Üst zaman diliminin bölgesi D’ye denk gelir', 'A zone of the higher timeframe meets D', 'Zone der höheren Zeiteinheit trifft D'],
  'ABCD-13': ['Bölge D’den önce hiç test edilmemiş', 'The zone was not tested before D', 'Zone wurde vor D noch nicht getestet'],
  'ABCD-14': ['Üst zaman diliminin trendi işlem yönünde', 'The higher timeframe trend runs with the trade', 'Trend der höheren Zeiteinheit läuft in Trade-Richtung'],
  'ABCD-15': ['İkinci seviye Seviye 1’e yakın (birleşme)', 'A second level lies near level 1 (confluence)', 'Zweites Level nahe Level 1 (Konfluenz)'],
  'ABCD-16': ['D harmonik bir formasyonun D’si', 'D is also the D of a harmonic pattern', 'D ist zugleich das D einer Harmonik'],
  'ABCD-17': RSI_D,
  'ABCD-18': ['RSI(7) uca yakın', 'RSI(7) is near the extreme', 'RSI(7) kurz vor dem Extrem'],
  'ABCD-19': DIV_D,
  'ABCD-20': ['D’de dönüş mumu', 'Reversal candle at D', 'Umkehrkerze bei D'],
  'ABCD-21': ['Trende karşı ve sapma yok', 'Against the trend without divergence', 'Gegen den Trend ohne Divergenz'],
  'ABCD-22': ['Kapanış bölgenin ötesine geçti', 'A close went beyond the zone', 'Schluss jenseits der Zone'],
  'ABCD-23': ['D bacağında iki güçlü mum', 'Two strong candles in the D leg', 'Zwei volumenstarke Kerzen im D-Bein'],
  'ABCD-24': ['Yapı bir çift tepe/dip’e benziyor', 'The shape is a double top or bottom', 'Form ist ein Doppeltop/-boden'],
  'ABCD-25': ['Zaman dilimi M1 veya M5', 'Timeframe is M1 or M5', 'Zeiteinheit M1 oder M5'],

  'GAR-01': FRACTAL_AB,
  'GAR-02': ALT,
  'GAR-03': ['B, XA’nın 0,618’ine ulaşır', 'B reaches 0.618 of XA', 'B erreicht 0,618 von XA'],
  'GAR-04': ['C, AB’nin 0,618 düzeltmesine ulaşır', 'C reaches the 0.618 correction of AB', 'C erreicht 0,618 Korrektur von AB'],
  'GAR-05': ['D, AB’nin uzantı hedefine ulaşır', 'D reaches the extension target of AB', 'D erreicht das Verlängerungsziel von AB'],
  'GAR-06': ['C temiz: düzeltme sınırın altında', 'C is clean: the correction stays below the limit', 'C ist sauber: Korrektur bleibt unter der Grenze'],
  'GAR-07': ['D, XA’nın 0,786’sında', 'D sits at 0.786 of XA', 'D liegt bei 0,786 von XA'],
  'GAR-08': ['C düzeltme derinliği 0,382 – 0,728', 'The correction depth of C is 0.382 to 0.728', 'Korrekturtiefe von C zwischen 0,382 und 0,728'],
  'GAR-09': ['AB=CD D’si ile Gartley D’si yakın (ATR)', 'The AB=CD D and the Gartley D are close (ATR)', 'AB=CD-D und Gartley-D liegen nah (ATR)'],
  'GAR-10': ZONE_D_IN,
  'GAR-11': SPACE,
  'GAR-12': HIGH_TF,
  'GAR-13': RSI_D,
  'GAR-14': DIV_D,
  'GAR-15': ['B fazla derin (Yarasa’ya geçer)', 'B is too deep (turns into a Bat)', 'B zu tief (wird zur Bat)'],
  'GAR-16': ['C fazla derin', 'C is too deep', 'C zu tief'],
  'GAR-17': ['C, A bölgesinin ötesine geçti', 'C went beyond the zone of A', 'C liegt jenseits der Zone von A'],
  'GAR-18': CLOSE_X,
  'GAR-19': ['Üst trend uzun süredir aşırı bölgede, ters yönde', 'The higher trend has stayed long in the extreme, against the trade', 'Höherer Trend lange im Extrem gegen den Trade'],
  'GAR-20': ['Zaman dilimi M15', 'Timeframe is M15', 'Zeiteinheit M15'],
  'GAR-21': ['Tek adımda oluşmuş temiz yapı', 'A clean structure formed in one step', 'Saubere Struktur in einem Zug'],

  'BAT-01': ['X ve A tamamlanmış fraktal, X→A bir itki', 'X and A are finished fractals, X→A is an impulse', 'X und A sind fertige Fraktale, X→A ist ein Impuls'],
  'BAT-02': ['X→A’da güçlü mumların payı yüksek', 'A high share of strong candles on X→A', 'Hoher Anteil volumenstarker Kerzen auf X→A'],
  'BAT-03': ['X→A tek hareket', 'X→A is a single move', 'X→A ist eine einzige Bewegung'],
  'BAT-04': ALT,
  'BAT-05': ['B, XA’nın 0,5’ine ulaşır', 'B reaches 0.5 of XA', 'B erreicht 0,5 von XA'],
  'BAT-06': ['C, AB’nin en az düzeltmesine ulaşır', 'C reaches the minimum correction of AB', 'C erreicht die Mindestkorrektur von AB'],
  'BAT-07': ['D, XA’nın 0,886’sında ve B’nin ötesinde', 'D sits at 0.886 of XA, beyond B', 'D liegt bei 0,886 von XA, jenseits von B'],
  'BAT-08': ['C düzeltme derinliği 0,382 – 0,728', 'The correction depth of C is 0.382 to 0.728', 'Korrekturtiefe von C zwischen 0,382 und 0,728'],
  'BAT-09': ['AB=CD D’si ile Bat D’si yakın (ATR)', 'The AB=CD D and the Bat D are close (ATR)', 'AB=CD-D und Bat-D liegen nah (ATR)'],
  'BAT-10': SPACE,
  'BAT-11': ZONE_D_IN,
  'BAT-12': HIGH_TF,
  'BAT-13': RSI_D,
  'BAT-14': ['B fazla derin (Gartley’e geçer)', 'B is too deep (turns into a Gartley)', 'B zu tief (wird zur Gartley)'],
  'BAT-15': ['C, A bölgesinin ötesine geçti', 'C went beyond the zone of A', 'C liegt jenseits der Zone von A'],
  'BAT-16': ['Zaman dilimi M15', 'Timeframe is M15', 'Zeiteinheit M15'],
  'BAT-17': CLOSE_X,

  'BUT-01': FRACTAL_AB,
  'BUT-02': ['B, XA’nın 0,786’sına ulaşır', 'B reaches 0.786 of XA', 'B erreicht 0,786 von XA'],
  'BUT-03': ['B fazla derin', 'B is too deep', 'B zu tief'],
  'BUT-04': ['C, AB’nin en az düzeltmesine ulaşır', 'C reaches the minimum correction of AB', 'C erreicht die Mindestkorrektur von AB'],
  'BUT-05': ['C fazla derin', 'C is too deep', 'C zu tief'],
  'BUT-06': ['Bir mum B’nin ötesinde kapanır', 'A candle closes beyond B', 'Eine Kerze schließt jenseits von B'],
  'BUT-07': ['D, XA’nın 1,272’sinde', 'D sits at 1.272 of XA', 'D liegt bei 1,272 von XA'],
  'BUT-08': ['C derin: güçlü düzeltme', 'C is deep: a strong correction', 'C ist tief: starke Korrektur'],
  'BUT-09': ['PRZ seviyesi D’ye yakın', 'The PRZ level is near D', 'PRZ-Level liegt nahe D'],
  'BUT-10': ['Uzantı seviyesi D’ye yakın', 'The extension level is near D', 'Verlängerungs-Level liegt nahe D'],
  'BUT-11': ['İç AB=CD seviyesi D’ye yakın', 'The inner AB=CD level is near D', 'Inneres AB=CD-Level liegt nahe D'],
  'BUT-12': ZONE_D_IN,
  'BUT-13': RSI_D,
  'BUT-14': DIV_D,
  'BUT-15': ['Üst zaman diliminin trendi işlem yönünde', 'The higher timeframe trend runs with the trade', 'Trend der höheren Zeiteinheit läuft in Trade-Richtung'],
  'BUT-16': ['Alt zaman diliminde dönüş', 'Reversal on the lower timeframe', 'Umkehr auf der tieferen Zeiteinheit'],

  'CRB-01': FRACTAL_AB,
  'CRB-02': ['C, AB’nin en az düzeltmesine ulaşır', 'C reaches the minimum correction of AB', 'C erreicht die Mindestkorrektur von AB'],
  'CRB-03': ['C fazla derin', 'C is too deep', 'C zu tief'],
  'CRB-04': ['D, XA’nın 1,618’inde', 'D sits at 1.618 of XA', 'D liegt bei 1,618 von XA'],
  'CRB-05': ['Bir mum B’nin ötesinde kapanır', 'A candle closes beyond B', 'Eine Kerze schließt jenseits von B'],
  'CRB-06': ['Crab: B, XA’nın 0,382’sine ulaşır', 'Crab: B reaches 0.382 of XA', 'Crab: B erreicht 0,382 von XA'],
  'CRB-07': ['Crab: B fazla derin', 'Crab: B is too deep', 'Crab: B zu tief'],
  'CRB-08': ['Deep Crab: B, XA’nın 0,886’sına ulaşır', 'Deep Crab: B reaches 0.886 of XA', 'Deep Crab: B erreicht 0,886 von XA'],
  'CRB-09': ['Deep Crab: B fazla derin', 'Deep Crab: B is too deep', 'Deep Crab: B zu tief'],
  'CRB-10': ['Crab PRZ seviyesi D’ye yakın', 'The Crab PRZ level is near D', 'Crab-PRZ-Level liegt nahe D'],
  'CRB-11': ['Deep Crab PRZ seviyesi D’ye yakın', 'The Deep Crab PRZ level is near D', 'Deep-Crab-PRZ-Level liegt nahe D'],
  'CRB-12': ZONE_D_IN,
  'CRB-13': RSI_D,
  'CRB-14': DIV_D,
  'CRB-15': ['Tercih edilen zaman dilimi', 'Preferred timeframe', 'Bevorzugte Zeiteinheit'],
  'CRB-16': ['Alt zaman diliminde dönüş', 'Reversal on the lower timeframe', 'Umkehr auf der tieferen Zeiteinheit'],

  'CYP-01': ['X→A itkisi, C A’nın ötesinde, dört tamamlanmış fraktal', 'Impulse X→A, C beyond A, four finished fractals', 'Impuls X→A, C jenseits von A, vier fertige Fraktale'],
  'CYP-02': ['Üst zaman diliminin trendi işlem yönünde', 'The higher timeframe trend runs with the trade', 'Trend der höheren Zeiteinheit läuft in Trade-Richtung'],
  'CYP-03': ['B, XA’nın düzeltme seviyesine ulaşır', 'B reaches the retracement level of XA', 'B erreicht das Rücksetzer-Level von XA'],
  'CYP-04': ['C, XA’nın 1,272 uzantısına ulaşır', 'C reaches the 1.272 extension of XA', 'C erreicht die Verlängerung 1,272 von XA'],
  'CYP-05': ['C’de sıkı Wave sapması', 'Strict Wave divergence at C', 'Strenge Wave-Divergenz bei C'],
  'CYP-06': ['C’de RSI(7) karşı uçta', 'RSI(7) at C is in the opposite extreme', 'RSI(7) bei C im Gegen-Extrem'],
  'CYP-07': ['D, XC’nin 0,786’sında', 'D sits at 0.786 of XC', 'D liegt bei 0,786 von XC'],
  'CYP-08': RSI_D,
  'CYP-09': ZONE_D_IN,
  'CYP-10': ['Giriş bir Libra girişiyle çakışır', 'The entry coincides with a Libra entry', 'Einstieg fällt mit einem Libra-Einstieg zusammen'],
  'CYP-11': ['Kapanış C sınırının ötesinde', 'A close beyond the C limit', 'Schluss jenseits der C-Grenze'],
  'CYP-12': PRZ,
  'CYP-13': HIGH_TF,
  'CYP-14': ['Zaman dilimi M15', 'Timeframe is M15', 'Zeiteinheit M15'],
  'CYP-15': ['Kapanış B sınırının ötesinde', 'A close beyond the B limit', 'Schluss jenseits der B-Grenze'],

  'CDT-01': ['H1 tamamlanmış fraktal, fitil ucunda', 'H1 is a finished fractal on a wick end', 'H1 ist ein fertiges Fraktal an der Dochtspitze'],
  'CDT-02': ['H1 önceki tepenin üstünde kapandı', 'H1 closed beyond the previous high', 'H1 schloss jenseits des vorigen Hochs'],
  'CDT-03': ['N tamamlanmış fraktal, fitil ucunda', 'N is a finished fractal on a wick end', 'N ist ein fertiges Fraktal an der Dochtspitze'],
  'CDT-04': ['Düzeltme derinliği en az 0,382', 'Correction depth is at least 0.382', 'Korrekturtiefe mindestens 0,382'],
  'CDT-05': ['H2, H1’in bölgesine dokunur', 'H2 touches the zone of H1', 'H2 berührt die Zone von H1'],
  'CDT-06': ['H2’ye yaklaşırken trend bölgeye doğru', 'The trend on the approach to H2 runs toward the zone', 'Trend beim Anlauf zu H2 läuft zur Zone hin'],
  'CDT-07': ['Üst zaman diliminin trendi işlem yönünde', 'The higher timeframe trend runs with the trade', 'Trend der höheren Zeiteinheit läuft in Trade-Richtung'],
  'CDT-08': ['Yaklaşım H1’e göre daha zayıf', 'The approach is weaker than the one to H1', 'Anlauf schwächer als der zu H1'],
  'CDT-09': ['H1 ve H2 arasında Wave sapması', 'Wave divergence between H1 and H2', 'Wave-Divergenz zwischen H1 und H2'],
  'CDT-10': ['Bölge yakınında Fibonacci seviyesi', 'A Fibonacci level lies near the zone', 'Fibonacci-Level nahe der Zone'],
  'CDT-11': ['Zaman dilimi H1, H4 veya D1', 'Timeframe is H1, H4 or D1', 'Zeiteinheit H1, H4 oder D1'],
  'CDT-12': ['H1’de RSI(7) uç bölgede', 'RSI(7) at H1 is in the extreme zone', 'RSI(7) bei H1 im Extrem'],
  'CDT-13': ['H2’de dönüş mumu', 'Reversal candle at H2', 'Umkehrkerze bei H2'],
  'CDT-14': ['H2’de RSI(7) uç bölgede', 'RSI(7) at H2 is in the extreme zone', 'RSI(7) bei H2 im Extrem'],
  'CDT-15': ['Kapanış H1’in ötesinde (küçük hacimsiz kapanış hariç)', 'A close beyond H1 (small low-volume closes excepted)', 'Schluss jenseits von H1 (kleine, nicht volumenstarke ausgenommen)'],
  'CDT-16': ['H1 ve H2 tamamlanmış fraktal', 'H1 and H2 are finished fractals', 'H1 und H2 sind fertige Fraktale'],
};

const INDEX: Record<Locale, 0 | 1 | 2> = { tr: 0, en: 1, de: 2 };

/** Kurztext der Bedingung in der Sprache; null, wenn keiner geschrieben ist */
export function ruleText(locale: Locale, id: string): string | null {
  return RULE_TEXTS[id]?.[INDEX[locale]] ?? null;
}
