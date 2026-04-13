import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Externalize native + ESM-only modules so they load at runtime instead of being bundled.
  // pdf-to-img / pdfjs requires @napi-rs/canvas as a native dep that webpack can't bundle.
  serverExternalPackages: [
    "@napi-rs/canvas",
    "pdf-to-img",
    "pdfjs-dist",
    "pdf-lib",
  ],
};

export default nextConfig;
