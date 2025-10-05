import type { NextConfig } from "next";

// Power Pages integration: enable static export. All dynamic features should be client-side only.
// If you later introduce dynamic routes requiring server runtime, you may need an alternate deploy path.
const basePath = process.env.DASHBOARD_BASE_PATH?.trim() || undefined;
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  basePath,
  // trailingSlash can help when serving from Dataverse web files; enable if necessary.
  // trailingSlash: true,
};

export default nextConfig;
