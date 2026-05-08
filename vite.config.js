import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  base: '/MY_DB_Dashboard/',
  server: {
    port: 3000
  },
  build: {
    outDir: 'dist'
  }
})
