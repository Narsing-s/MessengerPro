import type { NextConfig } from 'next';

const githubPages = process.env.GITHUB_PAGES === 'true';
const pagesBasePath = '/MessengerPro';

const nextConfig: NextConfig = {
  output: githubPages ? 'export' : 'standalone',
  basePath: githubPages ? pagesBasePath : '',
  assetPrefix: githubPages ? `${pagesBasePath}/` : undefined,
  trailingSlash: githubPages,
  images: { unoptimized: true },
};

export default nextConfig;
