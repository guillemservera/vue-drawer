import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@guillemservera/vue-drawer': fileURLToPath(new URL('../src/index.ts', import.meta.url)),
      '@guillemservera/drawer-core': fileURLToPath(new URL('../../core/src/index.ts', import.meta.url)),
    },
  },
})
