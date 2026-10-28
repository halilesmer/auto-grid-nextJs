/**
 * Butterfly (BUT): Bausteine für die Maße der Butterfly über dem XABCD-Kern (xabcd.ts).
 * Der Kern liefert X, A, B, C und D; hier stehen die Preise, die nur die Butterfly braucht:
 * das Ziel-D jenseits von X, die AB-Ausdehnung und die Rückprojektion der Strecke B → C.
 */
import { BUT_PARAMS } from './params';
import { levelAB, levelXA, type XabcdShape } from './xabcd';

/** Preis der Ausdehnung 1.272 der Fib X → A jenseits von X: hier ist die Butterfly vollendet (BUT-07) */
export const dTargetOfButterfly = (s: XabcdShape): number => levelXA(s, 1 + BUT_PARAMS.dExtension);

/** Preis der AB-Ausdehnung 1.618 (Level −0.618 der Fib A → B, BUT-10) */
export const abExtensionPrice = (s: XabcdShape): number => levelAB(s, -BUT_PARAMS.abExtension);
