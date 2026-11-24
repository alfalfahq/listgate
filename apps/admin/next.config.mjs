/** @type {import('next').NextConfig} */
const nextConfig = {
  // The shared database package ships TypeScript source.
  transpilePackages: ["@listgate/db"],
  // Native/wasm drivers stay as runtime requires instead of being bundled.
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  // Admin uploads whole-office REAXML files through a server action.
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
};

export default nextConfig;
