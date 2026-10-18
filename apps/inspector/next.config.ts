import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const config: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },
  // Dynamic catalog reads cannot be inferred by tracing. Keep these assets
  // inside the app so serverless deployments need no repository-relative paths.
  outputFileTracingIncludes: {
    '/*': ['./.generated/artifacts.json', './src/graphql/schema.graphql'],
  },
};
export default config;
