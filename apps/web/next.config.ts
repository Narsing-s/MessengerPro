import type { NextConfig } from 'next';

const githubPages = process.env.GITHUB_PAGES === 'true';

const nextConfig: NextConfig = {
  output: githubPages ? 'export' : 'standalone',
  basePath: githubPages ? '/MessengerPro' : '',
  trailingSlash: githubPages,
  images: { unoptimized: true },
};

export default nextConfig;
