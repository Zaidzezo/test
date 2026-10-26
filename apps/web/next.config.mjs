import { fileURLToPath } from 'node:url';
export default {
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  compress: false,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL ?? 'http://127.0.0.1:4000'}/api/:path*`,
      },
    ];
  },
  experimental: { cpus: 2 },
};
