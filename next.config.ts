import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the long-running local preview isolated while preserving Next's
  // standard production output, which Vercel expects at `.next`.
  // NEXT_DIST_DIR (the e2e spec's second dev server) only applies to dev, so a
  // variable left in the shell never moves `next build` away from `.next`.
  distDir: process.env.NODE_ENV === "development" ? process.env.NEXT_DIST_DIR || ".next-dev" : ".next",
  transpilePackages: ["@clube-do-jogo/domain", "@clube-do-jogo/data"],
  typescript: {
    tsconfigPath: "tsconfig.web.json",
  },
};

export default nextConfig;
