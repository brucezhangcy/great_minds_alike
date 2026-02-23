import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  // GitHub Pages serves project repos at /repo-name
  basePath: isProd ? "/great_minds_alike" : "",
  images: { unoptimized: true },
};

export default nextConfig;
