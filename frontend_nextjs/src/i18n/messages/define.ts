// Bir bölümün üç dilini yan yana tanımlar; tr kaynak, en/de aynı anahtarlara sahip olmak zorunda (tsc denetler).
export function defineArea<const T extends Record<string, string>>(
  tr: T,
  en: Record<keyof T, string>,
  de: Record<keyof T, string>,
) {
  return { tr, en, de };
}
