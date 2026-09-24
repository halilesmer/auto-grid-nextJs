import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E-Testleri (playwright.config.ts) bauen in einen eigenen Ordner: Next 16 sperrt
  // denselben distDir, sonst kollidiert der Testserver mit einem laufenden `next dev`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "*.ngrok-free.dev"],
    },
  },
};

export default nextConfig;
