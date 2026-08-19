import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * pdf-parse loads pdfjs-dist, which resolves its worker as a sibling file at
   * runtime. Bundling breaks that resolution ("Cannot find module
   * pdf.worker.mjs"), so these stay external and are required from node_modules
   * on the server instead.
   */
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
