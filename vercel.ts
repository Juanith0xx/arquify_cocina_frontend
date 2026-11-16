import type { VercelConfig } from '@vercel/config/v1';

const gateway = process.env.VERCEL_ENV === 'production'
  ? 'https://arquifycocinabackend-production.up.railway.app'
  : 'https://arquifycocinabackend-staging.up.railway.app';

export const config: VercelConfig = {
  framework: 'vite',
  rewrites: [
    {
      source: '/api/v1/:path*',
      destination: `${gateway}/api/v1/:path*`,
    },
  ],
};
