import type { NextConfig } from "next";
import { parseDevOrigins } from "./src/lib/devOrigins";

const nextConfig: NextConfig = {
  // E2E-Testleri (playwright.config.ts) bauen in einen eigenen Ordner: Next 16 sperrt
  // denselben distDir, sonst kollidiert der Testserver mit einem laufenden `next dev`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Telefon/LAN (SYS-12): `next dev` liefert Dev-Dateien nur an localhost (sonst 403). Weitere Hosts
  // stehen in ALLOWED_DEV_ORIGINS in der Umgebung des Dev-Servers, nicht im Repository. Ohne Wert bleibt alles wie bisher.
  allowedDevOrigins: parseDevOrigins(process.env.ALLOWED_DEV_ORIGINS),
  // Die Formationsseite ist der Modus Formation von /chart. Alte Links (gespeicherte Alarm-Meldungen, Lesezeichen) behalten ihren Query-String:
  // Next reicht die Query-Werte der Anfrage an das Ziel durch.
  async redirects() {
    return [{ source: '/formasyon', destination: '/chart?mode=formation', permanent: false }];
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "*.ngrok-free.dev"],
    },
  },
};

export default nextConfig;
