import type { NextConfig } from 'next';
import type { Configuration } from 'webpack';

const apiOrigin = process.env['API_URL'] ?? 'http://127.0.0.1:3001';

const nextConfig: NextConfig = {
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
