/**
 * ALLOWED_DEV_ORIGINS (Komma oder Leerraum getrennt) → `allowedDevOrigins` von `next dev` (SYS-12).
 *
 * `next dev` sperrt Dev-Dateien (/_next/…) für jede andere Origin als localhost mit 403. Wer den
 * Dev-Server vom Telefon im selben WLAN öffnet, trägt dessen Hostnamen hier ein, z. B.
 * ALLOWED_DEV_ORIGINS="mein-mac.local,192.0.2.10". Der Wert kommt aus der Umgebung des Dev-Servers,
 * nie aus dem Repository (Adressen sind privat). Next vergleicht nur den Hostnamen, so wie
 * `new URL(origin).hostname` ihn liefert: Schema, Benutzerkennung, Port und Pfad fallen weg, falls
 * jemand eine ganze URL einträgt, und eine IPv6-Adresse bekommt eckige Klammern. Ein Platzhalter
 * (`*.beispiel.test`) bleibt, öffnet aber jeden Host dieses Musters: lieber genaue Namen eintragen.
 */
export function parseDevOrigins(raw: string | undefined): string[] {
  const hosts: string[] = [];
  for (const part of (raw ?? '').split(/[\s,]+/)) {
    let host = part
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '') // Schema
      .replace(/[/?#].*$/, '') // Pfad, Query, Fragment
      .replace(/^[^@]*@/, '') // Benutzerkennung
      .replace(/^(\[[^\]]*\]):\d+$/, '$1') // Port hinter einer IPv6-Adresse in Klammern
      .replace(/^([^:]*):\d+$/, '$1') // Port hinter Hostname oder IPv4
      .toLowerCase();
    if (host.includes(':') && !host.startsWith('[')) host = `[${host}]`; // bloße IPv6-Adresse
    if (host && !hosts.includes(host)) hosts.push(host);
  }
  return hosts;
}
