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
      "./node_modules/pdfjs-dist/legacy/build/**/*",
      "./node_modules/pdfjs-dist/build/**/*",
      "./node_modules/pdf-to-img/**/*",
      "./node_modules/pdf-lib/**/*",
    ],
  },
  // TracPost blog and projects always route through the tenant engine
  // regardless of which marketing shell wraps them. The marketing-
  // specific rewrites (/, /about, /work, /contact) are now handled
  // in middleware so they can be hostname-conditioned (tracpost.com
  // serves current tenant template; next.tracpost.com serves the
  // new marketing route group).
  async rewrites() {
    return [
      { source: "/blog", destination: "/tenant/tracpost/blog" },
      { source: "/blog/:path*", destination: "/tenant/tracpost/blog/:path*" },
      { source: "/projects", destination: "/tenant/tracpost/projects" },
      { source: "/projects/:path*", destination: "/tenant/tracpost/projects/:path*" },
    ];
  },
};

export default nextConfig;
