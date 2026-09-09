import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      'server-only': fileURLToPath(new URL('./src/test/server-only-mock.ts', import.meta.url)),
    },
  },
  test: {
    // The default `forks` pool hangs in some sandboxed/containerized environments
    // (observed here: workers never report ready). Threads are more portable.
    pool: 'threads',
    // node, not jsdom, as the default: all but one of these suites test
    // server or pure logic, and standing up a jsdom instance per file
    // dominated the run (~225s of setup for ~0.4s of assertions) to the
    // point that worker startup began timing out. Component tests opt back
    // in with a `@vitest-environment jsdom` docblock — currently just
    // src/app/page.test.tsx.
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})
