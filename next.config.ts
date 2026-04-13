import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Externalize native + ESM-only modules so they load at runtime instead of being bundled.
  serverExternalPackages: [
    "@napi-rs/canvas",
    "pdf-to-img",
    "pdfjs-dist",
    "pdf-lib",
  ],
  // Force-include the linux canvas binary so Vercel deploys it.
  // Next.js's dependency tracer misses dynamic requires of platform-specific binaries.
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
      "./node_modules/@napi-rs/canvas/**/*",
    ],
  },
};

export default nextConfig;
