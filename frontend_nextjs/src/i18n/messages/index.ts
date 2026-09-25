import account from './account';
import bot from './bot';
import chart from './chart';
import common from './common';
import dashboard from './dashboard';
import errors from './errors';
import hints from './hints';
import logs from './logs';
import settings from './settings';
import ui from './ui';
import vps from './vps';
import zone from './zone';
import zoneEntry from './zoneEntry';

// Yeni bölüm: dosyayı ekle, buraya import et ve aşağıdaki listeye koy.
const areas = [common, dashboard, bot, settings, logs, errors, account, zone, zoneEntry, ui, chart, vps, hints] as const;

type Union2Intersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

export const tr = Object.assign({}, ...areas.map((a) => a.tr)) as Union2Intersection<(typeof areas)[number]['tr']>;
export const en = Object.assign({}, ...areas.map((a) => a.en)) as Record<keyof typeof tr, string>;
export const de = Object.assign({}, ...areas.map((a) => a.de)) as Record<keyof typeof tr, string>;

type StoredKey = keyof typeof tr;
// Çoğul anahtarlar `<anahtar>_one` / `<anahtar>_other` olarak saklanır; çağrıda temel anahtar + { count } verilir
type PluralBase<K> = K extends `${infer B}_one` ? B : never;

export type MessageKey = StoredKey | PluralBase<StoredKey>;
