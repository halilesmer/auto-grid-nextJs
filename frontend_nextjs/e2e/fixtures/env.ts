/**
 * Gemeinsame Werte für playwright.config.ts und die gemockten Tests.
 *
 * Der Testserver wird mit NEXT_PUBLIC_API_URL = MOCK_API gebaut. Diese Adresse existiert
 * nicht: jede Anfrage an sie (REST und WebSocket) beantwortet der MockWorker im Browser.
 */
export const E2E_PORT = Number(process.env.E2E_PORT || 3100);
export const MOCK_API = 'http://mock-worker.test';
// Kein echtes Geheimnis: prüft nur, dass jede Worker-Anfrage den Schlüssel mitsendet (SYS-05)
export const E2E_API_KEY = 'e2e-key';
