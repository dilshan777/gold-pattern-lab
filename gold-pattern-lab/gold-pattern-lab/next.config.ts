import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // technicalindicators ships untranspiled CJS; let Next compile it.
  transpilePackages: ["technicalindicators"],
};

export default nextConfig;
