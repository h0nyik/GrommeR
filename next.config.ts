import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const tauriDevHost = process.env.TAURI_DEV_HOST;

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Relativní cesty (./) aby webik fungoval v jakékoli složce na serveru. Dev: pouze pro Tauri.
  assetPrefix:
    isProd ? "./" : tauriDevHost ? `http://${tauriDevHost}:3000` : undefined,
};

export default nextConfig;
