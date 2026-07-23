import type { NextConfig } from "next";
import { platformSecurityHeaders, privateNoStoreHeaders } from "./src/lib/security/headers";

const appRoot = process.cwd();

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "http://192.168.1.161:3000",
    "192.168.1.161:3000",
    "localhost:3000",
  ],
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/(.*)", headers: platformSecurityHeaders },
      { source: "/admin/:path*", headers: privateNoStoreHeaders },
      { source: "/crew/:path*", headers: privateNoStoreHeaders },
      { source: "/employee/:path*", headers: privateNoStoreHeaders },
      { source: "/portal/:path*", headers: privateNoStoreHeaders },
      { source: "/api/portal/:path*", headers: privateNoStoreHeaders },
      { source: "/api/stripe/:path*", headers: privateNoStoreHeaders },
    ];
  },
  turbopack: {
    root: appRoot,
  },
};

export default nextConfig;
