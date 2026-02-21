import { defineConfig } from 'vite';

const target = process.env.AGW_API_TARGET || 'http://localhost:11946';
const port = Number(process.env.PORT || 11945);

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port,
    proxy: {
      '/api': {
        target,
        changeOrigin: true
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PREVIEW_PORT || 4173)
  }
});
