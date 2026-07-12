import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal .next/standalone build (self-contained server +
  // only the node_modules actually used) so the Docker image doesn't need
  // to ship the full node_modules tree.
  output: "standalone",
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
