import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The API and web containers are built from the same monorepo; `standalone`
  // keeps the runtime image to the traced files only.
  output: 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  typedRoutes: true,
};

export default config;
