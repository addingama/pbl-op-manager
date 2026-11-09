import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import type { Configuration } from 'webpack';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const apiOrigin = process.env['API_URL'] ?? 'http://127.0.0.1:3001';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  transpilePackages: ['@pbl/ui', '@pbl/shared'],
  webpack(config: Configuration): Configuration {
    config.resolve ??= {};
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
  rewrites() {
    return Promise.resolve([{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }]);
  },
};

export default nextConfig;
