import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@cubeos/telemetry", "@cubeos/ui"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "eoimages.gsfc.nasa.gov",
      },
      {
        protocol: "https",
        hostname: "assets.science.nasa.gov",
      },
    ],
  },
};

export default nextConfig;
