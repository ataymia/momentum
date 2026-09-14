import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Momentum ships as a fully static bundle. Every engine runs in the browser and talks to Firebase
 * Authentication and Firestore over their REST APIs, so there is no server runtime to host.
 */
const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
