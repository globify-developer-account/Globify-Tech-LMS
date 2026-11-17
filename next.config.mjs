// Plain JavaScript on purpose: hosts whose glibc is too old for Next's native
// SWC binary fall back to WebAssembly, which cannot compile a next.config.ts.
import createNextIntlPlugin from "next-intl/plugin";
import { PHASE_PRODUCTION_BUILD } from "next/constants.js";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(), browsing-topics=(), payment=(self)",
  },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
  serverExternalPackages: ["@prisma/client", "bcryptjs", "bullmq", "ioredis", "pdf-lib", "exceljs", "nodemailer"],
  // The production build host (Hostinger) reports 64 CPUs but caps the threads
  // a build may create. Next sizes its worker pool from the CPU count, so it
  // started 63 page-data workers and the native toolchain then aborted with
  // "OS can't spawn worker thread (os error 11)". Keep the build small.
  experimental: {
    cpus: 2,
    webpackBuildWorker: false,
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "**.globifytech.com" },
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  async redirects() {
    return [
      { source: "/student", destination: "/student/dashboard", permanent: false },
      { source: "/instructor", destination: "/instructor/dashboard", permanent: false },
      { source: "/admin", destination: "/admin/dashboard", permanent: false },
    ];
  },
};

export default function config(phase) {
  if (phase === PHASE_PRODUCTION_BUILD) {
    // Same host limit: SWC's Rust thread pools otherwise start one thread per
    // reported CPU in every build process. Workers inherit these at spawn.
    process.env.TOKIO_WORKER_THREADS ??= "2";
    process.env.RAYON_NUM_THREADS ??= "2";
  }
  return withNextIntl(nextConfig);
}
