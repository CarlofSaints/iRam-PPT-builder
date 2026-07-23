import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp is a native module — it must stay external to the server bundle.
  // Next externalises it by default; pinning it here keeps that true if the
  // defaults ever change, since /api/generate depends on it to downscale
  // Perigee photos before they are embedded in the deck.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
