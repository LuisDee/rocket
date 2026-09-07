import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The viewport sweep builds and serves the production output on its own port.
  // Sharing `.next` with a running `next dev` would clobber it, so the sweep
  // points this elsewhere. Unset everywhere else, which is every other case.
  distDir: process.env.ROCKET_E2E_DIST ?? '.next',
};

export default nextConfig;
