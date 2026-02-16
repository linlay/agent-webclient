import { defineConfig } from 'vite';

const target = process.env.AGW_API_TARGET || 'http://localhost:8080';
const port = Number(process.env.PORT || 5173);

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
