import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [react(), dts({ include: ['src'], rollupTypes: true })],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ReactAuroraBackground',
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        // Rollup strips module-level directives when bundling, so the
        // `'use client'` at the top of AuroraBackground.tsx never survives
        // into dist/. Re-injecting it as a banner is what actually makes
        // the published package usable in a Next.js App Router project
        // without the consumer having to wrap it in their own client
        // component. Harmless in the CJS build (just a string expression).
        banner: `'use client';`,
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
    sourcemap: true,
  },
})