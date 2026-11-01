import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    // Run test files one at a time: each file gets its own in-memory database
    fileParallelism: false,
    // The first run downloads a MongoDB binary, which can take a while
    hookTimeout: 120000,
    testTimeout: 20000,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret',
      JWT_EXPIRES_IN: '1h',
      // Blank on purpose: tests must never reach the real (Atlas) database
      MONGO_URI: '',
    },
  },
});
