import type { NextConfig } from "next";

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/",
        destination: "/governance",
        permanent: false,
      },
    ];
  },
};

initOpenNextCloudflareForDev();

export default nextConfig;
