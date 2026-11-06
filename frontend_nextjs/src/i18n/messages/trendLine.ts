import { defineArea } from './define';

// Trend çizgisi menüsü (plan 1105-A7, S4): trend çizgisine sağ tık / çift tık
export default defineArea(
  {
    'trendLine.menu': 'Trend çizgisi',
    'trendLine.up': 'Yukarı rengi',
    'trendLine.down': 'Aşağı rengi',
    'trendLine.reset': 'Varsayılana dön',
    'trendLine.reset.hint': 'Trend çizgisinin yukarı ve aşağı rengini, tipini ve kalınlığını varsayılana döndürür (mum rengi, düz, 2 px).',
    'trendLine.settings': 'Trend ayarları…',
    'trendLine.settings.hint': 'Trend ayar panelini açar: kural, en küçük boyut ve EWO değerleri. Panel bu tarayıcıda saklanır; emir göndermez.',
    'trendLine.settings.title': 'Trend ayarları',
  },
  {
    'trendLine.menu': 'Trend line',
    'trendLine.up': 'Up color',
    'trendLine.down': 'Down color',
    'trendLine.reset': 'Reset to default',
    'trendLine.reset.hint': 'Resets the up and down color, type and width of the trend line to the default (candle color, solid, 2 px).',
    'trendLine.settings': 'Trend settings…',
    'trendLine.settings.hint': 'Opens the trend settings panel: rule, minimum size and EWO values. The panel is saved in this browser; it sends no orders.',
    'trendLine.settings.title': 'Trend settings',
  },
  {
    'trendLine.menu': 'Trendlinie',
    'trendLine.up': 'Farbe aufwärts',
    'trendLine.down': 'Farbe abwärts',
    'trendLine.reset': 'Auf Standard zurücksetzen',
    'trendLine.reset.hint': 'Setzt Farbe, Typ und Dicke der Trendlinie (aufwärts und abwärts) auf den Standard zurück (Kerzenfarbe, durchgezogen, 2 px).',
    'trendLine.settings': 'Trend-Einstellungen…',
    'trendLine.settings.hint': 'Öffnet das Panel der Trend-Einstellungen: Regel, Mindestgröße und EWO-Werte. Das Panel wird in diesem Browser gespeichert; es löst keine Order aus.',
    'trendLine.settings.title': 'Trend-Einstellungen',
  },
);
