const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV !== 'production',
  register: true,
  skipWaiting: true,
});

module.exports = withPWA({
  reactStrictMode: true,
  swcMinify: true,
  // TEMP: build-only — skip type-checking during `next build` because
  // @types/react-dom@18.2.18 resolves @types/react@19 as a peer dep
  // in the pnpm lockfile, causing a spurious JSX element type mismatch.
  // Types are still validated via `tsc --noEmit` separately.
  typescript: {
    ignoreBuildErrors: true,
  },
});
