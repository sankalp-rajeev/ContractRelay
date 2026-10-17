import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    maxWorkers: 4,
    include: ['packages/**/test/**/*.test.ts'],
    environment: 'node',
    clearMocks: true,
    poolOptions: { forks: { execArgv: ['--experimental-sqlite'] } }
  }
});
