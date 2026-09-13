import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "*.ngrok-free.dev"],
    },
  },
};

export default nextConfig;
