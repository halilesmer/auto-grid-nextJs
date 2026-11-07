/**
 * Läuft einmal beim Start des Node-Servers, bevor er Anfragen annimmt.
 * Schreibt die echte TCP-Gegenstelle in jede Anfrage (VPS-04, src/lib/server/peerAddress.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installPeerHeader } = await import('@/lib/server/peerAddress');
    installPeerHeader();
  }
}
