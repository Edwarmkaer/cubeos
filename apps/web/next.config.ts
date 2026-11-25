import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@cubeos/telemetry", "@cubeos/ui"],
};

export default nextConfig;
