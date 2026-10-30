import type { NextConfig } from "next";
import { platformSecurityHeaders, privateNoStoreHeaders, privateFileHeaders, privatePortalHeaders } from "./src/lib/security/headers";
import { assertCurrentDeploymentIsolation } from "./src/lib/security/deployment";

assertCurrentDeploymentIsolation();

const appRoot = process.cwd();

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    "http://192.168.1.161:3000",
    "192.168.1.161:3000",
    "localhost:3000",
  ],
  reactStrictMode: true,
  // Preserve the document library's existing 25 MB file limit plus multipart overhead.
  experimental: { serverActions: { bodySizeLimit: "26mb" } },
  async headers() {
    return [
      { source: "/(.*)", headers: platformSecurityHeaders },
      { source: "/admin/:path*", headers: privateNoStoreHeaders },
      { source: "/crew/:path*", headers: privateNoStoreHeaders },
      { source: "/employee/:path*", headers: privateNoStoreHeaders },
      { source: "/files/:path*", headers: privateFileHeaders },
      { source: "/portal/:path*", headers: privatePortalHeaders },
      { source: "/api/portal/:path*", headers: privatePortalHeaders },
      { source: "/api/stripe/:path*", headers: privateNoStoreHeaders },
    ];
  },
  turbopack: {
    root: appRoot,
  },
};

export default nextConfig;
