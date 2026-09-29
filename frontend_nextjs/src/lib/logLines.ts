// Worker etiketi: "[ts] [LEVEL] [Z:<zone_id>] mesaj" (worker_python/src/core/grid_helpers.py)
const ZONE_TAG = /\[Z:([^\]]+)\] /;

/** Satırdaki bölge id'sini ve etiketsiz metni döner. */
export function splitZoneTag(line: string): { zoneId: string | null; text: string } {
  const m = ZONE_TAG.exec(line);
  if (!m) return { zoneId: null, text: line };
  return { zoneId: m[1], text: line.slice(0, m.index) + line.slice(m.index + m[0].length) };
}

/** Robot log satırının seviyeye göre rengi. */
export function logLineColor(line: string): string {
  if (
    line.includes("[ERROR]") ||
    line.includes("ERROR") ||
    line.includes("HATA") ||
    line.includes("[INIT]") ||
    line.includes("[LOGIN]") ||
    line.includes("Giriş Başarısız")
  ) {
    return "text-danger font-semibold";
  }
  if (line.includes("WARN") || line.includes("UYARI")) {
    return "text-warning";
  }
  if (
    line.includes("INFO") ||
    line.includes("[START]") ||
    line.includes("[STOP]") ||
    line.includes("BAŞARILI") ||
    line.includes("success")
  ) {
    return "text-info";
  }
  return "text-foreground/75";
}
