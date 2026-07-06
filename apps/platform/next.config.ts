import type { NextConfig } from "next";

const appRoot = process.cwd();

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "http://192.168.1.161:3000",
    "192.168.1.161:3000",
    "localhost:3000",
  ],
  reactStrictMode: true,
  turbopack: {
    root: appRoot,
  },
};

export default nextConfig;
