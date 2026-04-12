import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/code-playground.js',
      formats: ['es'],
      fileName: () => 'code-playground.js'
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {}
      }
    }
  },
  server: {
    open: '/docs/index.html'
  }
})
