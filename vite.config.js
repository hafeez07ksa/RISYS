import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    // @react-pdf/renderer is large and CommonJS-heavy. Without pre-bundling it
    // up front, Vite discovers it the first time a report is generated, and the
    // page that is already open asks for a dependency hash that no longer
    // exists — "Failed to fetch dynamically imported module". Listing it here
    // means it is optimised at server start instead, so the reload never happens.
    include: ['@react-pdf/renderer'],
  },
  build: {
    // The report renderer alone is over 1 MB; the warning adds nothing.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          // Loaded only when a PDF is generated, so it stays out of the
          // initial bundle for everyone who never opens Reports.
          'react-pdf': ['@react-pdf/renderer'],
        },
      },
    },
  },
})
